import { IListener, SQSEvents } from './types';
import * as Sentry from '@sentry/node';
import { SendMessageCommand, SQS } from '@aws-sdk/client-sqs';
import { ItemsEventEmitter } from './itemsEventEmitter';

/**
 * SQSListener receives business events and adds them to the queue
 */
export class SqsListener implements IListener {
  //doc: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-sqs/index.html
  private readonly sqsUrl: string;
  private readonly sqs: SQS;

  constructor(
    eventEmitter: ItemsEventEmitter,
    sqs: SQS,
    sqsUrl: string,
    sqsEventTypes: string[]
  ) {
    this.sqsUrl = sqsUrl;
    this.sqs = sqs;
    for (const eventType of sqsEventTypes) {
      eventEmitter.on(eventType, (data) => this.process(data));
    }
  }

  /**
   * takes in event type and convert them to SQS event types
   * and forwards the event type and data to SQS
   * @param data event payload
   */
  async process(data: any) {
    const action = SQSEvents[data.eventType];

    if (!action) return;

    const eventData = JSON.stringify({
      action: action,
      user_id: parseInt(data.user.id),
      item_id: parseInt((await data.savedItem).id),
      timestamp: data.timestamp,
      api_id: parseInt(data.apiUser.apiId),
    });

    await this.sendMessageToSqs(eventData);
  }

  private async sendMessageToSqs(data: any) {
    const sendCommand = new SendMessageCommand({
      MessageBody: data,
      QueueUrl: this.sqsUrl,
    });
    try {
      await this.sqs.send(sendCommand);
    } catch (err) {
      const eventData = JSON.parse(data);
      const errorMessage = `unable to add event ${eventData.action} to the queue
       for userId ${eventData.user_id} and itemId ${eventData.item_id}`;
      console.log(errorMessage, err);
      Sentry.captureMessage(errorMessage);
    }
  }
}
