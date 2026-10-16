
const AES_KEY = "jIU12kl;PO34+=+="
const RSA_MODULUS_HEX = "8c9847ddad1a07c0d7c69030e5ad6e41cd13f637c3fc0cb226d4158af3e96ce887b3bfbced5739d145e34226d569ba7a67eb064b0ae1608c2d752a276d4fe027"
const RSA_EXPONENT = 65537n
const RSA_SIZE = 64

const SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]

const RCON = [0x00,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36]

function utf8Bytes(text: string): Uint8Array {
  const data = Data.fromRawString(text, "utf-8")
  const bytes = data?.toUint8Array()
  if (!bytes) throw new Error("UTF-8 编码失败")
  return bytes
}

function toBase64(bytes: Uint8Array): string {
  const data = Data.fromUint8Array(bytes)
  if (!data) throw new Error("Base64 编码失败")
  return data.toBase64String()
}

function xtime(x: number): number {
  return ((x << 1) ^ ((x & 0x80) ? 0x1b : 0)) & 0xff
}

function mixColumn(s: Uint8Array, o: number): void {
  const a0=s[o], a1=s[o+1], a2=s[o+2], a3=s[o+3]
  const t=a0^a1^a2^a3
  const u=a0
  s[o]   = a0 ^ t ^ xtime(a0 ^ a1)
  s[o+1] = a1 ^ t ^ xtime(a1 ^ a2)
  s[o+2] = a2 ^ t ^ xtime(a2 ^ a3)
  s[o+3] = a3 ^ t ^ xtime(a3 ^ u)
}

function expandKey(key: Uint8Array): Uint8Array {
  if (key.length !== 16) throw new Error("AES key 必须为 16 字节")
  const out = new Uint8Array(176)
  out.set(key)
  let generated = 16
  let rcon = 1
  const temp = new Uint8Array(4)
  while (generated < 176) {
    temp.set(out.slice(generated - 4, generated))
    if (generated % 16 === 0) {
      const t=temp[0]
      temp[0]=SBOX[temp[1]]
      temp[1]=SBOX[temp[2]]
      temp[2]=SBOX[temp[3]]
      temp[3]=SBOX[t]
      temp[0] ^= RCON[rcon++]
    }
    for (let i=0;i<4;i++) {
      out[generated] = out[generated-16] ^ temp[i]
      generated++
    }
  }
  return out
}

export function aesEncryptBlock(block: Uint8Array, key: Uint8Array): Uint8Array {
  if (block.length !== 16) throw new Error("AES block 必须为 16 字节")
  const rk=expandKey(key)
  const s=new Uint8Array(block)
  const add=(round:number) => {
    const off=round*16
    for (let i=0;i<16;i++) s[i]^=rk[off+i]
  }
  add(0)
  for (let round=1;round<=9;round++) {
    for (let i=0;i<16;i++) s[i]=SBOX[s[i]]
    const t=new Uint8Array(s)
    for (let r=0;r<4;r++) {
      for (let c=0;c<4;c++) s[r+4*c]=t[r+4*((c+r)%4)]
    }
    for (let c=0;c<4;c++) mixColumn(s,c*4)
    add(round)
  }
  for (let i=0;i<16;i++) s[i]=SBOX[s[i]]
  {
    const t=new Uint8Array(s)
    for (let r=0;r<4;r++) {
      for (let c=0;c<4;c++) s[r+4*c]=t[r+4*((c+r)%4)]
    }
  }
  add(10)
  return s
}

export function encryptLoginValue(value: string): string {
  const src=utf8Bytes(value)
  const pad=16-(src.length%16)
  const padded=new Uint8Array(src.length+pad)
  padded.set(src)
  padded.fill(pad,src.length)
  const key=utf8Bytes(AES_KEY)
  const out=new Uint8Array(padded.length)
  for (let i=0;i<padded.length;i+=16) {
    out.set(aesEncryptBlock(padded.slice(i,i+16),key),i)
  }
  return toBase64(out)
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let x=0n
  for (const b of bytes) x=(x<<8n)|BigInt(b)
  return x
}

function bigIntToBytes(x: bigint, size: number): Uint8Array {
  const out=new Uint8Array(size)
  for (let i=size-1;i>=0;i--) {
    out[i]=Number(x&0xffn)
    x >>= 8n
  }
  return out
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result=1n
  base%=mod
  while (exp>0n) {
    if (exp&1n) result=(result*base)%mod
    exp >>= 1n
    base=(base*base)%mod
  }
  return result
}

function randomNonZero(count: number): Uint8Array {
  const result=new Uint8Array(count)
  let filled=0
  while (filled<count) {
    const data=Crypto.generateSymmetricKey(256).toUint8Array()
    if (!data) throw new Error("随机数生成失败")
    for (const b of data) {
      if (b!==0) result[filled++]=b
      if (filled>=count) break
    }
  }
  return result
}

/**
 * Verified against the current APK: RSA/ECB/PKCS1Padding, the embedded
 * 512-bit public key, and the captured 64-byte ciphertext shape. The
 * resulting ciphertext is persisted so this script keeps a stable
 * install-level login device identifier.
 */
export function encryptInstallDeviceId(plainId: string): string {
  const message=utf8Bytes(plainId)
  if (message.length>RSA_SIZE-11) throw new Error("设备标识过长")
  const ps=randomNonZero(RSA_SIZE-message.length-3)
  const em=new Uint8Array(RSA_SIZE)
  em[0]=0
  em[1]=2
  em.set(ps,2)
  em[2+ps.length]=0
  em.set(message,3+ps.length)
  const n=BigInt("0x"+RSA_MODULUS_HEX)
  const m=bytesToBigInt(em)
  const c=modPow(m,RSA_EXPONENT,n)
  return "B"+toBase64(bigIntToBytes(c,RSA_SIZE))
}
