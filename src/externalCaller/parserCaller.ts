import fetch from 'node-fetch';
import config from '../config';
import { backOff } from 'exponential-backoff';

export type ItemResponse = {
  itemId: string;
  resolvedId: string;
  title?: string;
};

/**
 * Method to connect to parser api to receive required item fields
 * for the given_url: itemId, resolvedId, and title
 * This is required by listApi to make a record
 * in list table.
 */
export class ParserCaller {
  private static async internalGetOrCreateItem(
    url: string
  ): Promise<ItemResponse> {
    const response = await fetch(
      `${config.parserDomain}/${
        config.parserVersion
      }/getItemListApi?url=${encodeURIComponent(url)}&getItem=1`
    );

    const data: any = await response.json();
    const item = data.item;
    if (!item || (item && !item.item_id) || (item && !item.resolved_id)) {
      throw new Error(`Unable to parse and generate item for ${url}`);
    }

    return {
      itemId: item.item_id,
      resolvedId: item.resolved_id,
      title: item.title ?? '',
    };
  }

  public static async getOrCreateItem(
    url: string,
    tries = 3
  ): Promise<ItemResponse> {
    const backOffOptions = {
      numOfAttempts: tries, //default is 10
      maxDelay: 10,
    };

    return (await backOff(
      async () => await this.internalGetOrCreateItem(url),
      backOffOptions
    )) as ItemResponse;
  }
}
