import { createUnifiedStorage } from "../storage/cache"

const storage = createUnifiedStorage("newsRepository")

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  pubDate: string;
  category: string;
  source: string;
}

export interface NewsResponse {
  items: NewsItem[];
  lastUpdated: string;
  source: string;
}

export class NewsRepository {
  private static readonly CACHE_KEY = "news_data";
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
  private static readonly MAX_CACHE_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  /**
   * Fetch news data with fallback to cache on failure
   */
  static async getNewsData(): Promise<NewsResponse> {
    try {
      // Try to fetch fresh data first
      const freshData = await this.fetchNewsFromAPI();
      if (freshData && freshData.items.length > 0) {
        // Save to cache if fetch successful
        await this.saveToCache(freshData);
        return freshData;
      }
    } catch (error) {
      console.warn("Failed to fetch fresh news data, trying cache:", error);
    }

    // Fallback to cached data
    try {
      const cachedData = await this.getFromCache();
      if (cachedData) {
        console.log("Using cached news data");
        return cachedData;
      }
    } catch (error) {
      console.warn("Failed to read cached news data:", error);
    }

    // Return empty data if both fetch and cache fail
    return {
      items: [],
      lastUpdated: new Date().toISOString(),
      source: "cache"
    };
  }

  /**
   * Force refresh news data from API
   */
  static async refreshNewsData(): Promise<NewsResponse> {
    try {
      const freshData = await this.fetchNewsFromAPI();
      if (freshData && freshData.items.length > 0) {
        await this.saveToCache(freshData);
        return freshData;
      }
    } catch (error) {
      console.error("Failed to refresh news data:", error);
    }

    // Return cached data even on refresh failure
    return await this.getFromCache() || {
      items: [],
      lastUpdated: new Date().toISOString(),
      source: "cache"
    };
  }

  /**
   * Check if cached data is still valid
   */
  static async isCacheValid(): Promise<boolean> {
    try {
      const cachedData = await this.getFromCache();
      if (!cachedData) return false;

      const cacheTime = new Date(cachedData.lastUpdated).getTime();
      const now = Date.now();

      // Check if cache is not too old
      return (now - cacheTime) < this.MAX_CACHE_AGE;
    } catch {
      return false;
    }
  }

  /**
   * Clear cached data
   */
  static async clearCache(): Promise<void> {
    try {
      await storage.remove(this.CACHE_KEY);
      console.log("News cache cleared");
    } catch (error) {
      console.error("Failed to clear cache:", error);
    }
  }

  /**
   * Get data from cache with age validation
   */
  private static async getFromCache(): Promise<NewsResponse | null> {
    try {
      const cachedData = await storage.get(this.CACHE_KEY);
      if (!cachedData) return null;

      const parsedData: NewsResponse = JSON.parse(cachedData);
      const cacheTime = new Date(parsedData.lastUpdated).getTime();
      const now = Date.now();

      // Check if cache is still within valid duration
      if (now - cacheTime < this.CACHE_DURATION) {
        return {
          ...parsedData,
          source: "cache"
        };
      }

      return null;
    } catch (error) {
      console.error("Error reading from cache:", error);
      return null;
    }
  }

  /**
   * Save data to cache
   */
  private static async saveToCache(data: NewsResponse): Promise<void> {
    try {
      const dataToSave: NewsResponse = {
        ...data,
        lastUpdated: new Date().toISOString()
      };
      await storage.set(this.CACHE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error("Error saving to cache:", error);
    }
  }

  /**
   * Fetch news data from API
   */
  private static async fetchNewsFromAPI(): Promise<NewsResponse | null> {
    try {
      // Use the existing fetchRSS function
      const { fetchRSSData } = await import("./fetchRSS");
      const rssData = await fetchRSSData();

      if (!rssData || rssData.length === 0) {
        return null;
      }

      // HTML标签清理与实体解码复合优化函数
      const { decodeHTMLEntities, filterTelegraphPrefix } = await import("./fetchRSS");
      const cleanText = (html: string) => {
        const stripped = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        return decodeHTMLEntities(filterTelegraphPrefix(stripped));
      };

      // Transform RSS data to NewsResponse format
      const newsItems: NewsItem[] = rssData.map((item) => {
        const title = cleanText(item.title || "");
        const summary = cleanText(item.content || "");
        return {
          id: title + (item.pubDate || ""),
          title: title,
          summary: summary,
          link: "",
          pubDate: item.pubDate || new Date().toISOString(),
          category: "新闻",
          source: "财联社"
        };
      });

      return {
        items: newsItems,
        lastUpdated: new Date().toISOString(),
        source: "api"
      };
    } catch (error) {
      console.error("Error fetching news from API:", error);
      return null;
    }
  }

  /**
   * Get cache statistics for debugging
   */
  static async getCacheStats(): Promise<{
    exists: boolean;
    ageMinutes: number;
    itemCount: number;
    lastUpdated: string;
  }> {
    try {
      const cachedData = await this.getFromCache();
      if (!cachedData) {
        return {
          exists: false,
          ageMinutes: 0,
          itemCount: 0,
          lastUpdated: ""
        };
      }

      const cacheTime = new Date(cachedData.lastUpdated).getTime();
      const ageMinutes = Math.floor((Date.now() - cacheTime) / (1000 * 60));

      return {
        exists: true,
        ageMinutes,
        itemCount: cachedData.items.length,
        lastUpdated: cachedData.lastUpdated
      };
    } catch {
      return {
        exists: false,
        ageMinutes: 0,
        itemCount: 0,
        lastUpdated: ""
      };
    }
  }
}