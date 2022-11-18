import fetch from 'node-fetch-retry';
import config from '../config';

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
  public static async getOrCreateItem(url: string): Promise<ItemResponse> {
    /**
     * The parser is fun and flaky at times, and subsequent calls can be successful
     * so lets try 3 times pausing 10ms between tries
     */
    const response = await fetch(
      `${config.parserDomain}/${
        config.parserVersion
      }/getItemListApi?url=${encodeURIComponent(url)}&getItem=1`,
      { method: 'GET', retry: 3, pause: 10 }
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
}
