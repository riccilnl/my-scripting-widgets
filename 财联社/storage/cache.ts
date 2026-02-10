

/**
 * 通用统一存储类（基于 Scripting v2 Storage API）
 * 支持异步、命名空间隔离、批量操作与导入导出。
 */
export class UnifiedStorage {
  private storageName: string;

  constructor(storageName: string) {
    this.storageName = storageName;
  }

  /** 获取完整存储数据 */
  private async getStorageData(): Promise<Record<string, any>> {
    try {
      const data = await Storage.get<Record<string, any>>(this.storageName);
      return data || {};
    } catch (error) {
      console.error("获取存储数据失败:", error);
      return {};
    }
  }

  /** 保存完整存储数据 */
  private async setStorageData(data: Record<string, any>): Promise<void> {
    try {
      await Storage.set(this.storageName, data, { shared: false });// ✅ 第三个参数表示持久化
    } catch (error) {
      console.error("保存存储数据失败:", error);
    }
  }

  /** 获取指定键 */
  async get<T = any>(key: string): Promise<T | undefined> {
    const data = await this.getStorageData();
    return data[key] as T;
  }

  /** 设置指定键 */
  async set(key: string, value: any): Promise<void> {
    const data = await this.getStorageData();
    data[key] = value;
    await this.setStorageData(data);
  }

  /** 删除指定键 */
  async remove(key: string): Promise<void> {
    const data = await this.getStorageData();
    delete data[key];
    await this.setStorageData(data);
  }

  /** 清空存储 */
  async clear(): Promise<void> {
    await this.setStorageData({});
  }

  /** 获取所有键 */
  async getAllKeys(): Promise<string[]> {
    const data = await this.getStorageData();
    return Object.keys(data);
  }

  /** 批量设置多个键值 */
  async batchSet(updates: Record<string, any>): Promise<void> {
    const data = await this.getStorageData();
    Object.assign(data, updates);
    await this.setStorageData(data);
  }

  /** 检查键是否存在 */
  async has(key: string): Promise<boolean> {
    const data = await this.getStorageData();
    return key in data;
  }

  /** 导出存储为 JSON */
  async exportConfig(): Promise<string> {
    const data = await this.getStorageData();
    return JSON.stringify(data, null, 2);
  }

  /** 导入配置 */
  async importConfig(configJson: string, confirm = false): Promise<boolean> {
    if (!confirm) {
      console.log("请传入 confirm: true 参数以确认导入存储配置");
      return false;
    }

    try {
      const config = JSON.parse(configJson);
      await this.clear();
      await this.batchSet(config);
      console.log("✅ 存储配置导入成功");
      return true;
    } catch (error) {
      console.error("❌ 存储配置导入失败:", error);
      return false;
    }
  }

  /** 获取存储名称 */
  getStorageName(): string {
    return this.storageName;
  }
}

/** 工厂方法 */
export const createUnifiedStorage = (name: string) => new UnifiedStorage(name);