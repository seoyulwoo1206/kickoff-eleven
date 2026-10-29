/* PeerJS(WebRTC) 방 코드 연결. 호스트 peer id는 ko11-<4글자>. 경기 데이터는 P2P, 시그널링만 PeerJS 공개 서버 */
import type { Peer as PeerT, DataConnection } from 'peerjs';
import type { NetMsg } from './protocol';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const NET = { role: null as 'host' | 'guest' | null, peer: null as PeerT | null, conn: null as DataConnection | null, code: '', ready: false, rtt: -1, lastPing: 0 };
export const LOCAL = () => (NET.role === 'guest' ? 1 : 0); // 로컬 사람이 조작하는 팀 인덱스
export interface PeerHooks { status(msg: string, ok?: boolean): void; onOpen(): void; onData(m: NetMsg): void; onClose(): void; }
let hooks: PeerHooks;
export function initPeer(h: PeerHooks) { hooks = h; }
async function loadPeer() { const mod = await import('peerjs'); return mod.Peer; }
export function netSend(m: NetMsg) { if (NET.conn && NET.conn.open) { try { NET.conn.send(m); } catch { /* 끊김 */ } } }
export function netClose() {
  if (NET.conn) { try { NET.conn.close(); } catch { /* */ } }
  if (NET.peer) { try { NET.peer.destroy(); } catch { /* */ } }
  NET.role = null; NET.peer = null; NET.conn = null; NET.ready = false; NET.code = ''; NET.rtt = -1;
}
export async function netHost() {
  netClose(); hooks.status('온라인 모듈 불러오는 중…');
  let Peer: Awaited<ReturnType<typeof loadPeer>>;
  try { Peer = await loadPeer(); } catch { hooks.status('온라인 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
  const code = genCode(), peer = new Peer('ko11-' + code, { debug: 0 });
  NET.peer = peer; NET.role = 'host'; NET.code = code; hooks.status('방 만드는 중…');
  peer.on('open', () => { hooks.status('방이 열렸어요. 친구에게 코드를 알려주고 기다리세요.'); hooks.onOpen(); });
  peer.on('connection', c => { if (NET.conn && NET.conn.open) { c.close(); return; } setupConn(c); });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* */ } });
  peer.on('error', e => { const type = (e as { type?: string }).type ?? ''; if (type === 'unavailable-id') netHost(); else hooks.status('연결 오류: ' + (type === 'network' || type === 'server-error' ? '서버에 닿지 못했어요. 잠시 후 다시 시도해 주세요.' : type)); });
}
export async function netJoin(codeIn: string) {
  const code = (codeIn || '').trim().toUpperCase(); if (code.length !== 4) { hooks.status('4글자 방 코드를 넣어 주세요.'); return; }
  netClose(); hooks.status('온라인 모듈 불러오는 중…');
  let Peer: Awaited<ReturnType<typeof loadPeer>>;
  try { Peer = await loadPeer(); } catch { hooks.status('온라인 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
  const peer = new Peer({ debug: 0 }); NET.peer = peer; NET.role = 'guest'; NET.code = code; hooks.status('방 ' + code + '에 연결 중…');
  peer.on('open', () => setupConn(peer.connect('ko11-' + code, { reliable: true })));
  peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* */ } });
  peer.on('error', e => { const type = (e as { type?: string }).type ?? ''; hooks.status(type === 'peer-unavailable' ? '코드 ' + code + '인 방을 찾을 수 없어요. 코드를 다시 확인해 주세요.' : '연결 오류: ' + (type === 'network' || type === 'server-error' ? '서버에 닿지 못했어요.' : type)); if (type === 'peer-unavailable') NET.role = null; hooks.onOpen(); });
}
function setupConn(c: DataConnection) {
  NET.conn = c;
  c.on('open', () => { NET.ready = true; NET.rtt = -1; NET.lastPing = 0; hooks.onOpen(); });
  c.on('data', d => hooks.onData(d as NetMsg));
  c.on('close', () => onConnClose());
  c.on('error', () => onConnClose());
}
function onConnClose() {
  if (!NET.conn) return;
  NET.conn = null; NET.ready = false; NET.rtt = -1;
  hooks.onClose();
}
export function netPing(perf: number) { if (NET.ready && perf - NET.lastPing > 2) { NET.lastPing = perf; netSend({ t: 'pg', ts: perf }); } }
