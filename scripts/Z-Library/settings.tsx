import { NavigationStack, List, Section, Text, TextField, SecureField, Button, useState } from "scripting"
import { DOMAINS, readDomain, saveDomain, readSession, forgetSession, login, importSession, profile } from "./api"

export function SettingsPage() {
  const [domain, setDomain] = useState(readDomain())
  const [session, setSession] = useState(readSession())
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [uid, setUid] = useState("")
  const [ukey, setUkey] = useState("")
  const [account, setAccount] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  async function refreshProfile() {
    try {
      const user = await profile()
      setAccount(String(user.name || user.email || "账号已登录"))
    } catch (e) { setNotice("账号资料获取失败：" + String(e)) }
  }
  async function signIn() {
    if (busy) return
    setBusy(true); setNotice("")
    try {
      await login(email, password)
      setPassword(""); setSession(readSession())
      setNotice("账号已登录；会话保存在 Keychain")
      await refreshProfile()
    } catch (e) { setNotice(String(e)) }
    finally { setBusy(false) }
  }
  async function importKeys() {
    if (busy) return
    setBusy(true); setNotice("")
    try {
      await importSession(uid, ukey)
      setUid(""); setUkey(""); setSession(readSession())
      setNotice("会话已验证并保存")
      await refreshProfile()
    } catch (e) { setNotice(String(e)) }
    finally { setBusy(false) }
  }
  function updateDomain() {
    try {
      saveDomain(domain)
      setDomain(readDomain()); setSession(null); setAccount("")
      setNotice("站点已保存，切换域名后需要重新登录")
    } catch (e) { setNotice(String(e)) }
  }
  function logout() {
    forgetSession(); setSession(null); setAccount(""); setNotice("已退出登录")
  }
  return <NavigationStack><List>
    <Section title="连接设置">
      <Text>当前站点：{readDomain()}</Text>
      <TextField title="站点" value={domain} onChanged={setDomain} />
      <Text font="caption">只接受：{DOMAINS.join("、")}</Text>
      <Button title="保存站点" systemImage="checkmark.circle" action={updateDomain} />
      <Button title="打开网页登录页" systemImage="safari" action={() => void Safari.openURL(readDomain())} />
    </Section>
    <Section title="个人账号">
      <Text>{session ? "已保存账号会话" : "尚未登录"}</Text>
      {account ? <Text>{account}</Text> : null}
      {session
        ? <>
            <Button title="刷新账号资料" action={() => void refreshProfile()} />
            <Button title="退出账号" action={logout} />
          </>
        : <>
            <TextField title="邮箱" value={email} onChanged={setEmail} />
            <SecureField title="密码" value={password} onChanged={setPassword} />
            <Button title={busy ? "验证中" : "登录账号"} disabled={busy} action={() => void signIn()} />
          </>}
    </Section>
    {!session ? <Section title="网页登录后的会话导入">
      <Text font="caption">如果登录接口不可用，可以在网页登录后安全取得自己账号的 remix_userid 和 remix_userkey，再粘贴验证。网站暂未确认支持 OAuth 回调，不能自动提取浏览器 Cookie。</Text>
      <TextField title="remix_userid" value={uid} onChanged={setUid} />
      <SecureField title="remix_userkey" value={ukey} onChanged={setUkey} />
      <Button title="验证并导入" disabled={busy || !uid || !ukey} action={() => void importKeys()} />
    </Section> : null}
    <Section title="文件保存">
      <Text>文件位置：文件 App → 我的 iPhone → Scripting → Z-Library</Text>
      <Text>书籍下载完成后可以用系统分享面板另存或打开。</Text>
    </Section>
    {notice ? <Section title="状态"><Text>{notice}</Text></Section> : null}
  </List></NavigationStack>
}
