import {
  NavigationStack, NavigationLink, List, Section, Text, TextField,
  SecureField, Button, HStack, VStack, Image, useState, useEffect
} from "scripting"
import {
  DOMAINS, readDomain, saveDomain, readSession, forgetSession, login,
  importSession, profile
} from "./api"
import { UI } from "./ui-tokens"

function AdvancedSettings({ onSessionChanged, onDomainChanged }: {
  onSessionChanged: () => void; onDomainChanged: () => void
}) {
  const [domain, setDomain] = useState(readDomain())
  const [uid, setUid] = useState("")
  const [ukey, setUkey] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState(readSession())

  function updateDomain() {
    try {
      saveDomain(domain)
      setDomain(readDomain()); setSession(null); onDomainChanged()
      setNotice("已保存站点，切换域名后需要重新登录")
    } catch (e) { setNotice(String(e)) }
  }
  async function importKeys() {
    if (busy) return
    setBusy(true); setNotice("")
    try {
      await importSession(uid, ukey)
      setUid(""); setUkey("")
      setSession(readSession()); onSessionChanged()
      setNotice("会话已验证并保存")
    } catch (e) { setNotice(String(e)) }
    finally { setBusy(false) }
  }

  return <List navigationTitle="高级设置" listStyle="insetGroup">
    <Section title="站点配置">
      <Text foregroundStyle={UI.secondary}>当前站点：{readDomain()}</Text>
      <TextField title="站点地址" value={domain} onChanged={setDomain} />
      <Button title="保存站点" systemImage="checkmark.circle" action={updateDomain} />
      <Button title="打开网页登录页" systemImage="safari"
        action={() => void Safari.openURL(readDomain())} />
      <Text font="caption" foregroundStyle={UI.secondary}>仅允许指定的 HTTPS 站点</Text>
      <Text font="caption" foregroundStyle={UI.muted}>{DOMAINS.join("、")}</Text>
    </Section>
    {!session ? <Section title="手动导入会话">
      <Text font="caption" foregroundStyle={UI.secondary}>
        仅在常规登录不可用时使用。网页登录 Cookie 无法自动导入。
      </Text>
      <TextField title="remix_userid" value={uid} onChanged={setUid} />
      <SecureField title="remix_userkey" value={ukey} onChanged={setUkey} />
      <Button title={busy ? "验证中…" : "验证并导入"}
        disabled={busy || !uid || !ukey} action={() => void importKeys()} />
    </Section> : null}
    {notice ? <Section title="状态"><Text>{notice}</Text></Section> : null}
  </List>
}

export function SettingsPage() {
  const [session, setSession] = useState(readSession())
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [account, setAccount] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  async function refreshProfile() {
    try {
      const user = await profile()
      setAccount(String(user.name || user.email || "账号已登录"))
    } catch (e) { setNotice("账号资料获取失败：" + String(e)) }
  }
  useEffect(() => {
    if (session) void refreshProfile()
  }, [])
  async function signIn() {
    if (busy) return
    setBusy(true); setNotice("")
    try {
      await login(email, password)
      setPassword(""); setSession(readSession())
      setNotice("会话已安全保存")
      await refreshProfile()
    } catch (e) { setNotice(String(e)) }
    finally { setBusy(false) }
  }
  function logout() {
    forgetSession(); setSession(null); setAccount(""); setNotice("已退出登录")
  }

  return <NavigationStack><List listStyle="insetGroup">
    <Section title="个人账号">
      <HStack spacing={12} padding={{ vertical: 8 }}>
        <Image systemName="person.crop.circle" foregroundStyle={UI.brand}
          frame={{ width: 34, height: 34 }} />
        <VStack alignment="leading" spacing={4}>
          <Text font="headline">{account || (session ? "会话已保存" : "尚未登录")}</Text>
          <Text font="caption" foregroundStyle={UI.secondary}>
            {session ? "已在本机保存登录会话" : "登录后可下载已获授权的图书"}
          </Text>
        </VStack>
      </HStack>
      {session ?
        <>
          <Button title="刷新账号资料" systemImage="arrow.clockwise"
            action={() => void refreshProfile()} />
          <Button title="退出账号" systemImage="rectangle.portrait.and.arrow.right"
            role="destructive" action={logout} />
        </> :
        <>
          <TextField title="邮箱" value={email} onChanged={setEmail} />
          <SecureField title="密码" value={password} onChanged={setPassword} />
          <Button title={busy ? "正在登录…" : "登录账号"}
            buttonStyle="borderedProminent" disabled={busy} action={() => void signIn()} />
        </>}
    </Section>

    <Section title="连接和存储">
      <HStack spacing={8}>
        <Image systemName="globe" foregroundStyle={UI.secondary} />
        <Text>当前站点</Text>
        <Text font="caption" foregroundStyle={UI.secondary}>{readDomain()}</Text>
      </HStack>
      <VStack alignment="leading" spacing={5} padding={{ vertical: 5 }}>
        <Text>下载位置</Text>
        <Text font="caption" foregroundStyle={UI.secondary}>
          文件 App → 我的 iPhone → Scripting → Z-Library
        </Text>
      </VStack>
    </Section>

    <Section title="更多选项">
      <NavigationLink destination={<AdvancedSettings
        onSessionChanged={() => { setSession(readSession()); setAccount("") }}
        onDomainChanged={() => { setSession(null); setAccount("") }} />}>
        <HStack spacing={9}>
          <Image systemName="gearshape.2" foregroundStyle={UI.secondary} />
          <Text>高级设置</Text>
        </HStack>
      </NavigationLink>
    </Section>
    {notice ? <Section title="状态"><Text>{notice}</Text></Section> : null}
  </List></NavigationStack>
}
