import type { FotileDevice, FotileSession } from "./fotile"

export type MqttBridgeEvent =
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "error"; message: string }
  | { type: "sync"; topic: string; payload: unknown }
  | { type: "reply"; topic: string; payload: unknown }
  | { type: "custom"; topic: string; payload: unknown }

const MQTT_JS = "https://fotile-mini-program.oss-cn-hangzhou.aliyuncs.com/fiks_dsbridge_mini/mqtt.5.14.1.min.js"
const MQTT_URL = "wss://api.fotile.com/mqtt"

function bridgeHTML(): string {
  return `<!doctype html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="${MQTT_JS}"></script></head>
<body><script>
(function () {
  let client = null;
  function post(message) {
    try { window.webkit.messageHandlers.fotileEvent.postMessage(message); } catch (_) {}
  }
  function parse(text) {
    try { return JSON.parse(text); } catch (_) { return text; }
  }
  window.fotileConnect = function (cfg) {
    if (!window.mqtt || typeof window.mqtt.connect !== 'function') {
      post({type:'error', message:'方太 MQTT 库加载失败'});
      return false;
    }
    try {
      if (client) {
        try { client.end(true); } catch (_) {}
        client = null;
      }
      post({type:'connecting'});
      client = window.mqtt.connect('${MQTT_URL}', {
        clientId: 'Fotile_wechat_' + String(cfg.userId),
        username: String(cfg.userId),
        password: String(cfg.accessToken),
        keepalive: 30,
        clean: true,
        reconnectPeriod: 3000,
        connectTimeout: 12000
      });
      client.on('connect', function () {
        const topics = [
          'sync/' + cfg.productId + '/' + cfg.deviceId,
          'reply/' + cfg.productId + '/' + cfg.deviceId,
          'CustomEvent/' + cfg.deviceId
        ];
        topics.forEach(function (topic) {
          client.subscribe(topic, {qos: 1}, function (err) {
            if (err) post({type:'error', message:'订阅失败: ' + topic + ' · ' + err.message});
          });
        });
        post({type:'connected'});
      });
      client.on('reconnect', function () { post({type:'connecting'}); });
      client.on('close', function () { post({type:'disconnected'}); });
      client.on('offline', function () { post({type:'disconnected'}); });
      client.on('error', function (err) { post({type:'error', message:String(err && err.message ? err.message : err)}); });
      client.on('message', function (topic, buffer) {
        const text = buffer && buffer.toString ? buffer.toString() : String(buffer || '');
        const payload = parse(text);
        let type = 'custom';
        if (topic.indexOf('sync/') === 0) type = 'sync';
        else if (topic.indexOf('reply/') === 0) type = 'reply';
        post({type:type, topic:topic, payload:payload});
      });
      return true;
    } catch (e) {
      post({type:'error', message:String(e && e.message ? e.message : e)});
      return false;
    }
  };
  window.fotilePublish = function (topic, payload) {
    if (!client || !client.connected) return false;
    try {
      client.publish(topic, JSON.stringify(payload), {qos:1});
      return true;
    } catch (_) { return false; }
  };
  window.fotileDisconnect = function () {
    if (client) {
      try { client.end(true); } catch (_) {}
      client = null;
    }
    return true;
  };
  post({type:'bridgeReady'});
})();
</script></body></html>`
}

class FotileMqttBridge {
  private webView: WebViewController | null = null
  private loaded = false
  private connected = false
  private device: FotileDevice | null = null
  private listeners = new Set<(event: MqttBridgeEvent) => void>()
  private waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = []

  subscribe(listener: (event: MqttBridgeEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: MqttBridgeEvent): void {
    if (event.type === "connected") {
      this.connected = true
      const waiters = this.waiters.splice(0)
      waiters.forEach((item) => item.resolve())
    } else if (event.type === "disconnected") {
      this.connected = false
    } else if (event.type === "error") {
      if (!this.connected && this.waiters.length) {
        const waiters = this.waiters.splice(0)
        waiters.forEach((item) => item.reject(new Error(event.message)))
      }
    }
    this.listeners.forEach((listener) => listener(event))
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded && this.webView) return
    const webView = new WebViewController({ ephemeral: true })
    await webView.addScriptMessageHandler("fotileEvent", (event: any) => {
      if (!event || typeof event !== "object") return true
      if (event.type === "bridgeReady") return true
      if (event.type === "error") {
        this.emit({ type: "error", message: String(event.message ?? "MQTT 错误") })
      } else if (event.type === "connected" || event.type === "connecting" || event.type === "disconnected") {
        this.emit({ type: event.type })
      } else if (event.type === "sync" || event.type === "reply" || event.type === "custom") {
        this.emit({ type: event.type, topic: String(event.topic ?? ""), payload: event.payload })
      }
      return true
    })
    const ok = await webView.loadHTML(bridgeHTML(), "https://iot-test.fotile.com/")
    if (!ok) {
      webView.dispose()
      throw new Error("MQTT 桥接页面加载失败")
    }
    await webView.waitForLoad()
    this.webView = webView
    this.loaded = true
  }

  async connect(session: FotileSession, device: FotileDevice): Promise<void> {
    await this.ensureLoaded()
    this.device = device
    this.connected = false
    const config = JSON.stringify({
      userId: session.userId,
      accessToken: session.accessToken,
      productId: device.productId,
      deviceId: device.id,
    })

    const wait = new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject })
      setTimeout(() => {
        const index = this.waiters.findIndex((item) => item.resolve === resolve)
        if (index >= 0) {
          this.waiters.splice(index, 1)
          reject(new Error("MQTT 连接超时"))
        }
      }, 15000)
    })

    const webView = this.webView
    if (!webView) throw new Error("MQTT 桥接未初始化")
    const accepted = await webView.evaluateJavaScript<boolean>(`return window.fotileConnect(${config})`)
    if (!accepted) throw new Error("MQTT 连接启动失败")
    await wait
  }

  isConnected(): boolean {
    return this.connected
  }

  private async publish(topic: string, payload: unknown): Promise<void> {
    if (!this.webView || !this.connected) throw new Error("MQTT 尚未连接")
    const t = JSON.stringify(topic)
    const p = JSON.stringify(payload)
    const ok = await this.webView.evaluateJavaScript<boolean>(`return window.fotilePublish(${t}, ${p})`)
    if (!ok) throw new Error("MQTT 发布失败")
  }

  async publishControl(payload: unknown): Promise<void> {
    if (!this.device) throw new Error("尚未找到 N10")
    await this.publish(`control/${this.device.productId}/${this.device.id}`, payload)
  }

  async publishService(payload: unknown): Promise<void> {
    if (!this.device) throw new Error("尚未找到 N10")
    await this.publish(`service/${this.device.productId}/${this.device.id}`, payload)
  }

  async disconnect(): Promise<void> {
    this.connected = false
    if (this.webView) {
      try { await this.webView.evaluateJavaScript("return window.fotileDisconnect()") } catch {}
      this.webView.dispose()
    }
    this.webView = null
    this.loaded = false
    this.device = null
    this.waiters = []
  }
}

export const mqttBridge = new FotileMqttBridge()
