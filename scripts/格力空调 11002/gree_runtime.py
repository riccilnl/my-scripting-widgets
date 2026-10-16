import base64
import json
import os
import socket
import time

PORT = 7000
GENERIC_KEY = b"a3K8Bx%2r8Y7#xDh"
RESULT_PREFIX = "__GREE_JSON__"


# Small, dependency-free AES-128 implementation for the Gree v1 LAN protocol.
def _xtime(a):
    return ((a << 1) ^ 0x1B) & 0xFF if a & 0x80 else (a << 1) & 0xFF


def _gmul(a, b):
    p = 0
    for _ in range(8):
        if b & 1:
            p ^= a
        a = _xtime(a)
        b >>= 1
    return p


def _gf_pow(a, n):
    r = 1
    while n:
        if n & 1:
            r = _gmul(r, a)
        a = _gmul(a, a)
        n >>= 1
    return r


def _rotl8(x, n):
    return ((x << n) | (x >> (8 - n))) & 0xFF


def _make_sboxes():
    sbox = [0] * 256
    inv = [0] * 256
    for a in range(256):
        x = 0 if a == 0 else _gf_pow(a, 254)
        s = x ^ _rotl8(x, 1) ^ _rotl8(x, 2) ^ _rotl8(x, 3) ^ _rotl8(x, 4) ^ 0x63
        sbox[a] = s
        inv[s] = a
    return sbox, inv


SBOX, INV_SBOX = _make_sboxes()


def _sub_word(w):
    return bytes(SBOX[x] for x in w)


def _rot_word(w):
    return w[1:] + w[:1]


def _key_schedule(key):
    if len(key) != 16:
        raise ValueError("AES-128 requires a 16-byte key")
    words = [bytes(key[i:i + 4]) for i in range(0, 16, 4)]
    rcon = 1
    while len(words) < 44:
        temp = words[-1]
        if len(words) % 4 == 0:
            temp = bytearray(_sub_word(_rot_word(temp)))
            temp[0] ^= rcon
            temp = bytes(temp)
            rcon = _xtime(rcon)
        words.append(bytes(a ^ b for a, b in zip(words[-4], temp)))
    return [b"".join(words[i:i + 4]) for i in range(0, 44, 4)]


def _add_round_key(state, key):
    return [a ^ b for a, b in zip(state, key)]


def _sub_bytes(state):
    return [SBOX[x] for x in state]


def _inv_sub_bytes(state):
    return [INV_SBOX[x] for x in state]


def _shift_rows(s):
    out = [0] * 16
    for r in range(4):
        for c in range(4):
            out[4 * c + r] = s[4 * ((c + r) % 4) + r]
    return out


def _inv_shift_rows(s):
    out = [0] * 16
    for r in range(4):
        for c in range(4):
            out[4 * c + r] = s[4 * ((c - r) % 4) + r]
    return out


def _mix_columns(s):
    out = list(s)
    for c in range(4):
        i = 4 * c
        a0, a1, a2, a3 = s[i:i + 4]
        out[i] = _gmul(a0, 2) ^ _gmul(a1, 3) ^ a2 ^ a3
        out[i + 1] = a0 ^ _gmul(a1, 2) ^ _gmul(a2, 3) ^ a3
        out[i + 2] = a0 ^ a1 ^ _gmul(a2, 2) ^ _gmul(a3, 3)
        out[i + 3] = _gmul(a0, 3) ^ a1 ^ a2 ^ _gmul(a3, 2)
    return out


def _inv_mix_columns(s):
    out = list(s)
    for c in range(4):
        i = 4 * c
        a0, a1, a2, a3 = s[i:i + 4]
        out[i] = _gmul(a0, 14) ^ _gmul(a1, 11) ^ _gmul(a2, 13) ^ _gmul(a3, 9)
        out[i + 1] = _gmul(a0, 9) ^ _gmul(a1, 14) ^ _gmul(a2, 11) ^ _gmul(a3, 13)
        out[i + 2] = _gmul(a0, 13) ^ _gmul(a1, 9) ^ _gmul(a2, 14) ^ _gmul(a3, 11)
        out[i + 3] = _gmul(a0, 11) ^ _gmul(a1, 13) ^ _gmul(a2, 9) ^ _gmul(a3, 14)
    return out


def _aes_encrypt_block(block, key):
    if len(block) != 16:
        raise ValueError("AES block must be 16 bytes")
    rks = _key_schedule(key)
    s = _add_round_key(list(block), rks[0])
    for rnd in range(1, 10):
        s = _sub_bytes(s)
        s = _shift_rows(s)
        s = _mix_columns(s)
        s = _add_round_key(s, rks[rnd])
    s = _sub_bytes(s)
    s = _shift_rows(s)
    s = _add_round_key(s, rks[10])
    return bytes(s)


def _aes_decrypt_block(block, key):
    if len(block) != 16:
        raise ValueError("AES block must be 16 bytes")
    rks = _key_schedule(key)
    s = _add_round_key(list(block), rks[10])
    for rnd in range(9, 0, -1):
        s = _inv_shift_rows(s)
        s = _inv_sub_bytes(s)
        s = _add_round_key(s, rks[rnd])
        s = _inv_mix_columns(s)
    s = _inv_shift_rows(s)
    s = _inv_sub_bytes(s)
    s = _add_round_key(s, rks[0])
    return bytes(s)


def _pkcs7_pad(data):
    n = 16 - (len(data) % 16)
    return data + bytes([n]) * n


def _pkcs7_unpad(data):
    if not data:
        raise ValueError("empty plaintext")
    n = data[-1]
    if n < 1 or n > 16 or data[-n:] != bytes([n]) * n:
        # Some older implementations simply trim after the final JSON brace.
        end = data.rfind(b"}")
        if end >= 0:
            return data[:end + 1]
        raise ValueError("invalid PKCS#7 padding")
    return data[:-n]


def _encrypt_pack(obj, key):
    raw = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    raw = _pkcs7_pad(raw)
    enc = b"".join(_aes_encrypt_block(raw[i:i + 16], key) for i in range(0, len(raw), 16))
    return base64.b64encode(enc).decode("ascii")


def _decrypt_pack(pack, key):
    if isinstance(pack, dict):
        return pack
    raw = base64.b64decode(pack)
    if len(raw) % 16:
        raise ValueError("encrypted pack is not block-aligned")
    dec = b"".join(_aes_decrypt_block(raw[i:i + 16], key) for i in range(0, len(raw), 16))
    return json.loads(_pkcs7_unpad(dec).decode("utf-8"))


def _decode_datagram(data, key):
    outer = json.loads(data.decode("utf-8"))
    if "pack" in outer:
        outer["pack"] = _decrypt_pack(outer["pack"], key)
    return outer


def _make_outer(mac, command, data=None, bind=False):
    outer = {
        "cid": "app",
        "i": 1 if bind else 0,
        "t": "pack" if data is not None else command,
        "uid": 0,
        "tcid": mac,
    }
    if data is not None:
        inner = {"t": command, "mac": mac}
        inner.update(data)
        outer["pack"] = inner
    return outer


def _encode_outer(outer, key):
    obj = dict(outer)
    if isinstance(obj.get("pack"), dict):
        obj["pack"] = _encrypt_pack(obj["pack"], key)
    return json.dumps(obj, separators=(",", ":")).encode("utf-8")


def _sock(timeout=1.0):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.settimeout(timeout)
    try:
        s.bind(("", 0))
    except OSError:
        pass
    return s


def _broadcast_targets():
    targets = ["255.255.255.255"]
    # Many home WLANs are /24. Sending to the interface's /24 broadcast as well
    # improves discovery on routers that do not forward the limited broadcast.
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 53))
        ip = probe.getsockname()[0]
        parts = ip.split(".")
        if len(parts) == 4 and ip != "127.0.0.1":
            targets.append(".".join(parts[:3] + ["255"]))
    except OSError:
        pass
    finally:
        probe.close()
    return list(dict.fromkeys(targets))


def _scan_for_mid(mid, timeout=3.0):
    s = _sock(0.4)
    deadline = time.monotonic() + timeout
    payload = json.dumps({"t": "scan"}, separators=(",", ":")).encode("utf-8")
    # A repeated broadcast helps on Wi-Fi when the first packet is lost during radio wake-up.
    for target in _broadcast_targets():
        for _ in range(2):
            try:
                s.sendto(payload, (target, PORT))
            except OSError:
                pass
            time.sleep(0.06)

    found = []
    while time.monotonic() < deadline:
        try:
            data, addr = s.recvfrom(65535)
        except socket.timeout:
            continue
        except OSError:
            continue
        try:
            msg = _decode_datagram(data, GENERIC_KEY)
            pack = msg.get("pack") or {}
            if pack.get("t") != "dev":
                continue
            dev = {
                "ip": addr[0],
                "port": addr[1] or PORT,
                "mac": pack.get("mac") or pack.get("cid") or msg.get("cid"),
                "mid": str(pack.get("mid", "")),
                "name": pack.get("name") or "Gree AC",
                "ver": pack.get("ver") or "",
            }
            found.append(dev)
            if dev["mid"] == str(mid) and dev["mac"]:
                return s, dev, found
        except Exception:
            continue
    return s, None, found


def _bind_on_socket(s, dev, timeout=2.5):
    mac = dev["mac"]
    outer = _make_outer(mac, "bind", {"uid": 0}, bind=True)
    s.sendto(_encode_outer(outer, GENERIC_KEY), (dev["ip"], PORT))
    deadline = time.monotonic() + timeout
    old_timeout = s.gettimeout()
    s.settimeout(0.35)
    try:
        while time.monotonic() < deadline:
            try:
                data, addr = s.recvfrom(65535)
            except socket.timeout:
                continue
            if addr[0] != dev["ip"]:
                continue
            try:
                msg = _decode_datagram(data, GENERIC_KEY)
                pack = msg.get("pack") or {}
                if pack.get("t") == "bindok" and pack.get("key"):
                    return str(pack["key"])
            except Exception:
                continue
    finally:
        s.settimeout(old_timeout)
    raise RuntimeError("发现空调，但绑定失败；请保持手机与空调在同一 Wi-Fi 后重试")


def _discover_and_bind(mid):
    s, dev, found = _scan_for_mid(mid)
    try:
        if dev is None:
            mids = sorted({d.get("mid", "?") for d in found})
            detail = f"；发现的 mid: {', '.join(mids)}" if mids else ""
            raise RuntimeError(f"未发现 mid={mid} 的格力空调{detail}")
        key = _bind_on_socket(s, dev)
        dev["key"] = key
        return dev
    finally:
        s.close()


def _direct_exchange(dev, command, inner_data, expected, timeout=1.8):
    key_text = dev.get("key") or ""
    if len(key_text.encode("utf-8")) != 16:
        raise RuntimeError("缓存的设备 key 无效，需要重新绑定")
    key = key_text.encode("utf-8")
    mac = dev["mac"]
    outer = _make_outer(mac, command, inner_data, bind=False)
    payload = _encode_outer(outer, key)
    s = _sock(0.35)
    try:
        s.sendto(payload, (dev["ip"], int(dev.get("port") or PORT)))
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                data, addr = s.recvfrom(65535)
            except socket.timeout:
                continue
            if addr[0] != dev["ip"]:
                continue
            try:
                msg = _decode_datagram(data, key)
                pack = msg.get("pack") or {}
                if pack.get("t") in expected:
                    return pack
            except Exception:
                continue
        raise TimeoutError("空调没有响应")
    finally:
        s.close()


def _as_int(value, default=None):
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _fahrenheit_record(temp_f):
    # Mirrors the mapping used by greeclimate for TemUn=1.
    c = (float(temp_f) - 32.0) * 5.0 / 9.0
    tem_set = int(round(c))
    tem_rec = 1 if (c - tem_set) > 0 else 0
    return tem_set, tem_rec


def _decode_target_temperature(data):
    tem_set = _as_int(data.get("SetTem"))
    if tem_set is None:
        return None
    unit = _as_int(data.get("TemUn"), 0)
    tem_rec = _as_int(data.get("TemRec"), 0)
    if unit != 1:
        return tem_set

    matches = []
    for temp_f in range(46, 87):
        rec = _fahrenheit_record(temp_f)
        if rec == (tem_set, tem_rec):
            matches.append(temp_f)
    if matches:
        return matches[0]
    return int(round(tem_set * 9.0 / 5.0 + 32.0))


def _decode_sensor_celsius(raw, mid=None):
    if raw is None or raw == "":
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value == 0:
        return None

    # Real captures from mid=11002 show TemSen=19 meaning 19°C directly.
    # Other Gree families often encode it with a +40 offset.  Keep both forms.
    if 40 <= value <= 100:
        value -= 40
    if not (-30 <= value <= 60):
        return None
    return value


def _read_fields(dev, fields):
    """Read a field group. Returns only fields actually present in the response."""
    pack = _direct_exchange(dev, "status", {"cols": list(fields)}, {"dat"})
    cols = pack.get("cols") or list(fields)
    vals = pack.get("dat") or []
    return dict(zip(cols, vals))


def _read_one(dev, field):
    data = _read_fields(dev, [field])
    return data.get(field)


def _safe_read_one(dev, field, default=None):
    try:
        value = _read_one(dev, field)
        return default if value is None else value
    except Exception:
        return default


def _read_state(dev):
    # Different mid=11002 firmware branches are inconsistent about which
    # combinations of status columns they accept. Start with the canonical
    # greeclimate 20-column query, then progressively try smaller groups.
    canonical = [
        "Pow", "Mod", "SetTem", "TemSen", "TemUn", "TemRec",
        "WdSpd", "Air", "Blo", "Health", "SwhSlp", "SlpMod", "Lig",
        "SwingLfRig", "SwUpDn", "Quiet", "Tur", "StHt", "SvSt",
        "HeatCoolType",
    ]
    groups = [
        canonical,
        ["Pow", "SetTem", "TemSen", "TemUn", "TemRec"],
        ["Pow", "SetTem", "TemUn", "TemRec"],
        ["Pow", "TemSen"],
        ["Pow", "SetTem"],
        ["SetTem", "TemSen"],
    ]

    data = {}
    probe_errors = []
    for fields in groups:
        try:
            got = _read_fields(dev, fields)
            for k, v in got.items():
                # Preserve the first useful value, but allow a later probe to
                # fill a field that was omitted/null in an earlier response.
                if k not in data or data[k] is None or data[k] == "":
                    data[k] = v
        except Exception as exc:
            probe_errors.append({"fields": fields, "error": str(exc)})
        if all(data.get(k) is not None for k in ("Pow", "SetTem", "TemSen")):
            break

    pow_raw = data.get("Pow")
    if pow_raw is None:
        pow_raw = _read_one(dev, "Pow")
    if pow_raw is None:
        raise RuntimeError("空调响应中没有 Pow 状态")

    set_tem = data.get("SetTem")
    tem_sen = data.get("TemSen")
    tem_un = data.get("TemUn")
    tem_rec = data.get("TemRec")

    # Final fallback for firmware that only answers a single-column request.
    if set_tem is None:
        set_tem = _safe_read_one(dev, "SetTem")
    if tem_sen is None:
        tem_sen = _safe_read_one(dev, "TemSen")
    if tem_un is None:
        tem_un = _safe_read_one(dev, "TemUn", 0)
    if tem_rec is None:
        tem_rec = _safe_read_one(dev, "TemRec", 0)

    state_data = {
        "Pow": pow_raw,
        "SetTem": set_tem,
        "TemSen": tem_sen,
        "TemUn": tem_un,
        "TemRec": tem_rec,
    }

    unit_flag = _as_int(tem_un, 0)
    unit = "F" if unit_flag == 1 else "C"
    current_c = _decode_sensor_celsius(tem_sen, dev.get("mid"))
    current = current_c
    if current_c is not None and unit == "F":
        current = round(current_c * 9.0 / 5.0 + 32.0, 1)

    target = _decode_target_temperature(state_data)
    if unit == "F":
        temp_min, temp_max = 61, 86
    else:
        temp_min, temp_max = 16, 30

    return {
        "power": bool(_as_int(pow_raw, 0)),
        "currentTemperature": current,
        "targetTemperature": target,
        "temperatureUnit": unit,
        "temperatureMin": temp_min,
        "temperatureMax": temp_max,
        "raw": state_data,
        "probeErrors": probe_errors,
    }


def _raw_status_probe(dev, fields, timeout=0.75):
    """Return decrypted replies for one status query without filtering pack type."""
    key_text = dev.get("key") or ""
    if len(key_text.encode("utf-8")) != 16:
        raise RuntimeError("缓存的设备 key 无效，需要重新绑定")
    key = key_text.encode("utf-8")
    mac = dev["mac"]
    outer = _make_outer(mac, "status", {"cols": list(fields)}, bind=False)
    payload = _encode_outer(outer, key)
    s = _sock(0.20)
    responses = []
    try:
        s.sendto(payload, (dev["ip"], int(dev.get("port") or PORT)))
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline and len(responses) < 4:
            try:
                raw, addr = s.recvfrom(65535)
            except socket.timeout:
                continue
            except OSError as exc:
                responses.append({"socketError": str(exc)})
                break
            if addr[0] != dev["ip"]:
                continue
            item = {"from": addr[0], "bytes": len(raw)}
            try:
                msg = json.loads(raw.decode("utf-8"))
                item["outer"] = {
                    "t": msg.get("t"),
                    "i": msg.get("i"),
                    "uid": msg.get("uid"),
                    "cid": msg.get("cid"),
                    "tcid": msg.get("tcid"),
                }
                pack = msg.get("pack")
                try:
                    item["pack"] = _decrypt_pack(pack, key) if pack is not None else None
                except Exception as exc:
                    item["packDecodeError"] = str(exc)
            except Exception as exc:
                item["outerDecodeError"] = str(exc)
                item["rawPrefix"] = raw[:160].decode("utf-8", errors="replace")
            responses.append(item)
    finally:
        s.close()
    return responses


def _debug_temperature(dev):
    canonical = [
        "Pow", "Mod", "SetTem", "TemSen", "TemUn", "TemRec",
        "WdSpd", "Air", "Blo", "Health", "SwhSlp", "SlpMod", "Lig",
        "SwingLfRig", "SwUpDn", "Quiet", "Tur", "StHt", "SvSt",
        "HeatCoolType",
    ]
    probes = [
        ("hid", ["hid"]),
        ("canonical20", canonical),
        ("temp5", ["Pow", "SetTem", "TemSen", "TemUn", "TemRec"]),
        ("pow_set", ["Pow", "SetTem"]),
        ("pow_sensor", ["Pow", "TemSen"]),
        ("set_sensor", ["SetTem", "TemSen"]),
        ("set_only", ["SetTem"]),
        ("sensor_only", ["TemSen"]),
    ]
    result = {
        "device": {
            "ip": dev.get("ip"),
            "port": dev.get("port"),
            "mac": dev.get("mac"),
            "mid": dev.get("mid"),
            "name": dev.get("name"),
            "ver": dev.get("ver"),
        },
        "queries": [],
    }
    for name, fields in probes:
        try:
            replies = _raw_status_probe(dev, fields)
            result["queries"].append({"name": name, "fields": fields, "responses": replies})
        except Exception as exc:
            result["queries"].append({"name": name, "fields": fields, "error": str(exc)})
    return result

def _status(dev):
    return _read_state(dev)


def _set_power(dev, value):
    _direct_exchange(dev, "cmd", {"opt": ["Pow"], "p": [1 if value else 0]}, {"res", "result"})
    # Keep power control independent from temperature support.
    state = _read_state(dev)
    return state


def _set_temperature(dev, desired):
    # Use the same grouped status path that is known to work on mid=11002.
    # Reading TemUn by itself is not reliable on this firmware branch.
    before = _read_state(dev)
    unit = before.get("temperatureUnit") or "C"
    desired = int(round(float(desired)))

    if unit == "F":
        if desired < 61 or desired > 86:
            raise ValueError("设定温度必须在 61–86°F")
        tem_set, tem_rec = _fahrenheit_record(desired)
        opt = ["TemUn", "SetTem", "TemRec"]
        values = [1, tem_set, tem_rec]
    else:
        if desired < 16 or desired > 30:
            raise ValueError("设定温度必须在 16–30°C")
        # Public Gree V1 protocol examples use this minimal Celsius command.
        opt = ["TemUn", "SetTem"]
        values = [0, desired]

    ack = _direct_exchange(dev, "cmd", {"opt": opt, "p": values}, {"res", "result"})

    # Confirm with the grouped 11002 status query; do not depend on a single-field
    # SetTem request, because that is exactly what failed on this firmware.
    state = _read_state(dev)
    state["commandAck"] = ack
    return state

def _ensure_device(config, mid, force=False):
    if not force and isinstance(config, dict):
        if config.get("mac") and config.get("ip") and config.get("key") and str(config.get("mid")) == str(mid):
            return dict(config)
    return _discover_and_bind(mid)


def _try_with_rebind(config, mid, fn):
    dev = _ensure_device(config, mid)
    try:
        value = fn(dev)
        return dev, value, False
    except (TimeoutError, RuntimeError, OSError, ValueError):
        # DHCP changes and power-cycles are common. Re-scan/re-bind once, then retry.
        dev = _ensure_device({}, mid, force=True)
        value = fn(dev)
        return dev, value, True


def _read_params():
    raw = os.environ.get("SCRIPTING_QUERY_PARAMETERS", "{}")
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _emit(obj):
    print(RESULT_PREFIX + json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


def _emit_state(dev, state, rebound=False, message=None):
    payload = {
        "ok": True,
        "device": dev,
        "power": state.get("power"),
        "currentTemperature": state.get("currentTemperature"),
        "targetTemperature": state.get("targetTemperature"),
        "temperatureUnit": state.get("temperatureUnit"),
        "temperatureMin": state.get("temperatureMin"),
        "temperatureMax": state.get("temperatureMax"),
        "rebound": rebound,
    }
    if message:
        payload["message"] = message
    _emit(payload)


def main():
    p = _read_params()
    action = str(p.get("action", "status"))
    mid = str(p.get("mid", "11002"))
    try:
        cfg = json.loads(p.get("config") or "{}")
    except Exception:
        cfg = {}

    try:
        if action == "reset":
            _emit({"ok": True, "device": None, "message": "已清除绑定缓存"})
            return

        if action == "discover":
            dev = _discover_and_bind(mid)
            try:
                state = _read_state(dev)
                _emit_state(dev, state, message="发现并绑定成功")
            except Exception:
                _emit({"ok": True, "device": dev, "power": None, "message": "发现并绑定成功；状态暂时读取失败"})
            return

        if action == "debugStatus":
            dev = _ensure_device(cfg, mid)
            report = _debug_temperature(dev)
            _emit({"ok": True, "device": dev, "debug": report})
            return

        if action == "status":
            dev, state, rebound = _try_with_rebind(cfg, mid, _status)
            _emit_state(dev, state, rebound=rebound)
            return

        if action == "setPower":
            desired = str(p.get("value", "false")).lower() in ("1", "true", "yes", "on")
            dev, state, rebound = _try_with_rebind(cfg, mid, lambda d: _set_power(d, desired))
            _emit_state(dev, state, rebound=rebound)
            return

        if action == "setTemperature":
            raw_value = p.get("value", "")
            if raw_value == "":
                raise ValueError("缺少设定温度")
            desired = float(raw_value)
            dev, state, rebound = _try_with_rebind(cfg, mid, lambda d: _set_temperature(d, desired))
            _emit_state(dev, state, rebound=rebound)
            return

        raise RuntimeError(f"未知操作: {action}")
    except Exception as e:
        _emit({"ok": False, "error": str(e), "device": cfg or None})


if __name__ == "__main__":
    main()
