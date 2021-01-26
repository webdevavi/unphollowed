import { Injectable, Logger } from "@nestjs/common"
import { Constants } from "src/constants"
import axiosRateLimit from "axios-rate-limit"
import axios from "axios"
import qs from "qs"
import { OAuthService } from "src/oAuth/oAuth.service"
import { OnEvent } from "@nestjs/event-emitter"
import { StatusEvent } from "src/events/status/status.events"
import { StatusCreateEvent } from "src/events/status/status.create"
import { StatusReplyEvent } from "src/events/status/status.reply"
import twitter from "twitter-text"
import { TweetParams } from "src/types/tweetParams.type"

@Injectable()
export class StatusService {
  constructor(
    private readonly oAuthService: OAuthService,
    private readonly constants: Constants
  ) {}

  private readonly logger = new Logger(StatusService.name)

  private http = axiosRateLimit(axios.create(), {
    maxRequests: 300,
    perMilliseconds: 1000 * 60 * 60 * 3, // 3 Hours
  })

  @OnEvent(StatusEvent.Tweet)
  async create({ text }: StatusCreateEvent) {
    this.logger.log(`Sending tweet: ${text}`)

    await this.sendTweetOrMakeThread(text)
  }

  @OnEvent(StatusEvent.Reply)
  async reply({ text, inReplyToTweetId, user }: StatusReplyEvent) {
    const partialParams: Partial<TweetParams> = {
      in_reply_to_status_id: inReplyToTweetId,
      auto_populate_reply_metadata: true,
    }

    this.logger.log(`Replying to ${user}: ${text}`)

    await this.sendTweetOrMakeThread(text, partialParams)
  }

  private async sendTweetOrMakeThread(
    text: string,
    partialParams: Partial<TweetParams> = {}
  ) {
    const splits = this.getTweetSplits(text)

    if (splits.length === 1) {
      this.logger.log("This tweet is valid, making a single tweet")

      this.sendTweet({ ...partialParams, status: splits[0] })
    } else if (splits.length > 1) {
      this.logger.warn("This tweet isn't valid, making a thread")

      if (partialParams.in_reply_to_status_id) {
        this.makeThread(partialParams.in_reply_to_status_id, splits)
      } else {
        const parentTweetId = await this.sendTweet({
          ...partialParams,
          status: splits[0],
        })
        this.makeThread(parentTweetId, splits.slice(1))
      }
    }
  }

  private async sendTweet(params: TweetParams): Promise<string> {
    const url = this.constants.statusUpdateEndpoint

    try {
      const { data } = await this.http.post(url, qs.stringify(params), {
        headers: {
          Authorization: this.oAuthService.oAuth01aHeader(url, "POST", params),
        },
      })

      this.logger.log(`Tweet sent: ${params.status}`)
      return data["id_str"] as string
    } catch (err) {
      this.logger.error(err.response.data)
      return null
    }
  }

  private async makeThread(parentTweetId: string, tweetSplits: Array<string>) {
    let inReplyToTweetId = parentTweetId

    for (const split in tweetSplits) {
      const params: TweetParams = {
        status: tweetSplits[split],
        in_reply_to_status_id: inReplyToTweetId,
        auto_populate_reply_metadata: true,
      }

      inReplyToTweetId = await this.sendTweet(params)
    }
  }

  private getTweetSplits(text: string): Array<string> {
    const splits: Array<string> = []
    const { length: _length } = text

    while (splits.join("").length !== _length) {
      const { validRangeStart, validRangeEnd } = twitter.parseTweet(text)

      splits.push(text.substring(validRangeStart, validRangeEnd + 1))
      text = text.substring(validRangeEnd + 1)
    }

    return splits
  }
}
