import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createHmac } from "crypto"
import { TWITTER, TwitterConfig } from "src/config/twitter.config"
import { WebhookIdDto } from "./webhookIdDto"
import { writeFileSync } from "fs"
import { join } from "path"
import { GLOBAL, GlobalConfig } from "src/config/global.config"
import { post } from "request"
import { Constants } from "src/utils/constants"

@Injectable()
export class TwitterService {
  constructor(
    private readonly configSerivce: ConfigService,
    private readonly constants: Constants
  ) {
    this.registerWebhook()
  }

  registerWebhook() {
    const oauth = {
      consumer_key: this.configSerivce.get<TwitterConfig>(TWITTER).apiKey,
      consumer_secret: this.configSerivce.get<TwitterConfig>(TWITTER)
        .apiKeySecret,
      token: this.configSerivce.get<TwitterConfig>(TWITTER).accessToken,
      token_secret: this.configSerivce.get<TwitterConfig>(TWITTER)
        .accessTokenSecret,
    }

    const request_options = {
      url: this.constants.webhookRegistrationEndpoint,
      oauth,
      headers: {
        "Content-type": "application/x-www-form-urlencoded",
      },
      form: {
        url:
          this.configSerivce.get<GlobalConfig>(GLOBAL).origin +
          "/webhook/twitter",
      },
    }

    console.log("Creating a POST request")
    console.log(`to ${this.constants.webhookRegistrationEndpoint}`)
    console.log("for webhook registration")
    console.log(
      `of webhook url ${
        this.configSerivce.get<GlobalConfig>(GLOBAL).origin
      }/webhook/twitter
      `
    )

    console.log(`with auth config: `, oauth)

    post(request_options, function (_, __, body) {
      console.log(body)
    })
  }

  createChallengeResponse(crcToken: string) {
    const { apiKeySecret } = this.configSerivce.get<TwitterConfig>(TWITTER)
    const hmac = createHmac("sha256", apiKeySecret)
      .update(crcToken)
      .digest("base64")

    return `sha256=${hmac}`
  }

  storeWebhookId(webhookId: WebhookIdDto) {
    const path = join(__dirname, "id.json")
    writeFileSync(path, JSON.stringify(webhookId.toJSON()))
  }
}