/**
 * Restrição de rede para contas administradoras.
 *
 * O admin pode remover outras contas, então as funções administrativas só
 * funcionam a partir da rede local (loopback + faixas privadas) ou de IPs/CIDRs
 * liberados em `ADMIN_TRUSTED_NETWORKS`.
 *
 * Este módulo é puro e seguro para o Edge runtime: não importa `node:*` nem
 * `next/headers`.
 */

export type HeaderReader = {
  get(name: string): string | null;
};

type ParsedIp = {
  version: 4 | 6;
  value: bigint;
};

type ParsedNetwork = ParsedIp & {
  prefix: number;
};

/**
 * Rede local por padrão, no espírito do Home Assistant: loopback + faixas
 * privadas + link-local + IPv6 ULA.
 *
 * Tailscale (100.64.0.0/10) NÃO entra por padrão; libere explicitamente em
 * `ADMIN_TRUSTED_NETWORKS` se usar acesso remoto pelo tailnet.
 */
export const DEFAULT_ADMIN_TRUSTED_NETWORKS = [
  "127.0.0.0/8",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "fe80::/10",
  "fc00::/7",
];

export const ADMIN_NETWORK_RESTRICTED_MESSAGE =
  "O painel de usuários só pode ser usado na rede local ou em IPs autorizados.";

export const ADMIN_LOGIN_RESTRICTED_MESSAGE =
  "Este usuário administrador só pode entrar pela rede local ou por IPs autorizados.";

function parseIPv4(input: string): bigint | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;

  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function parseIPv6(input: string): bigint | null {
  let address = input;

  // Endereço com escopo (fe80::1%eth0).
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);

  // IPv4 embutido no final (::ffff:192.168.1.5).
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    const embedded = parseIPv4(tail);
    if (embedded === null) return null;
    const high = Number((embedded >> 16n) & 0xffffn).toString(16);
    const low = Number(embedded & 0xffffn).toString(16);
    address = `${address.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tailGroups =
    halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tailGroups.length;
    if (missing < 1) return null;
    groups = [
      ...head,
      ...Array.from({ length: missing }, () => "0"),
      ...tailGroups,
    ];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

/** Converte um IP textual em versão + valor numérico. */
export function parseIp(input: string): ParsedIp | null {
  let value = input.trim();
  if (!value) return null;

  // [::1]:3000 / [::1]
  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) value = bracketed[1]!;

  // 192.168.1.5:3000
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.indexOf(":"));
  }

  // IPv4 mapeado em IPv6 (forma textual usual).
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) value = mapped[1]!;

  if (value.includes(":")) {
    const parsed = parseIPv6(value);
    if (parsed === null) return null;

    // ::ffff:c0a8:105 também representa um IPv4.
    if (parsed >> 32n === 0xffffn) {
      return { version: 4, value: parsed & 0xffffffffn };
    }
    return { version: 6, value: parsed };
  }

  const parsed = parseIPv4(value);
  return parsed === null ? null : { version: 4, value: parsed };
}

function parseNetwork(input: string): ParsedNetwork | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const slash = trimmed.lastIndexOf("/");
  const address = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const parsed = parseIp(address);
  if (!parsed) return null;

  const maxPrefix = parsed.version === 4 ? 32 : 128;
  const prefix =
    slash === -1 ? maxPrefix : Number(trimmed.slice(slash + 1).trim());

  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
    return null;
  }

  return { ...parsed, prefix };
}

function ipMatchesNetwork(ip: ParsedIp, network: ParsedNetwork): boolean {
  if (ip.version !== network.version) return false;

  const bits = ip.version === 4 ? 32n : 128n;
  const shift = bits - BigInt(network.prefix);
  return ip.value >> shift === network.value >> shift;
}

function formatIPv4(value: bigint): string {
  return [24n, 16n, 8n, 0n]
    .map((shift) => Number((value >> shift) & 0xffn))
    .join(".");
}

function formatIPv6(value: bigint): string {
  const groups: number[] = [];
  for (let shift = 112n; shift >= 0n; shift -= 16n) {
    groups.push(Number((value >> shift) & 0xffffn));
  }

  // Comprime a maior sequência de zeros (mínimo de 2 grupos).
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index] !== 0) continue;
    let end = index;
    while (end < groups.length && groups[end] === 0) end += 1;
    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }

  const hex = groups.map((group) => group.toString(16));
  if (bestLength < 2) return hex.join(":");

  const head = hex.slice(0, bestStart).join(":");
  const tail = hex.slice(bestStart + bestLength).join(":");
  return `${head}::${tail}`;
}

export function formatIp(ip: ParsedIp): string {
  return ip.version === 4 ? formatIPv4(ip.value) : formatIPv6(ip.value);
}

let cachedRaw: string | undefined;
let cachedNetworks: ParsedNetwork[] | undefined;

function parseTrustedNetworks(raw: string): ParsedNetwork[] {
  if (!raw) {
    return DEFAULT_ADMIN_TRUSTED_NETWORKS.map(parseNetwork).filter(
      (network): network is ParsedNetwork => network !== null,
    );
  }

  const entries = raw.split(/[\s,]+/).filter(Boolean);
  if (entries.some((entry) => entry === "*" || entry.toLowerCase() === "all")) {
    return [
      { version: 4, value: 0n, prefix: 0 },
      { version: 6, value: 0n, prefix: 0 },
    ];
  }

  const networks = entries
    .map(parseNetwork)
    .filter((network): network is ParsedNetwork => network !== null);

  if (networks.length === 0) {
    console.warn(
      "[verde] ADMIN_TRUSTED_NETWORKS não contém nenhum IP/CIDR válido; o acesso administrativo ficará bloqueado.",
    );
  }

  return networks;
}

export function getAdminTrustedNetworks(): ParsedNetwork[] {
  const raw = process.env.ADMIN_TRUSTED_NETWORKS?.trim() ?? "";
  if (cachedNetworks && cachedRaw === raw) return cachedNetworks;

  cachedRaw = raw;
  cachedNetworks = parseTrustedNetworks(raw);
  return cachedNetworks;
}

/** Lista legível para exibir na tela de acesso restrito. */
export function getAdminTrustedNetworkLabels(): string[] {
  const raw = process.env.ADMIN_TRUSTED_NETWORKS?.trim();
  if (!raw) return DEFAULT_ADMIN_TRUSTED_NETWORKS;
  return raw.split(/[\s,]+/).filter(Boolean);
}

/**
 * IP do cliente a partir dos headers do proxy.
 *
 * Usamos a entrada mais à direita do `X-Forwarded-For`: é a que o proxy mais
 * próximo (Nginx/Caddy/Tailscale) ou o próprio Next anexa ao request. A
 * esquerda pode ter sido enviada pelo cliente e, portanto, é falsificável.
 */
export function getClientIp(headers: HeaderReader): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const part = parts[index];
      if (!part) continue;
      const parsed = parseIp(part);
      if (parsed) return formatIp(parsed);
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    const parsed = parseIp(realIp);
    if (parsed) return formatIp(parsed);
  }

  return null;
}

export function isIpAllowed(ip: string): boolean {
  const parsed = parseIp(ip);
  if (!parsed) return false;
  return getAdminTrustedNetworks().some((network) =>
    ipMatchesNetwork(parsed, network),
  );
}

export type AdminNetworkStatus = {
  allowed: boolean;
  ip: string | null;
  networks: string[];
};

export function getAdminNetworkStatus(
  headers: HeaderReader,
): AdminNetworkStatus {
  const ip = getClientIp(headers);
  return {
    allowed: ip !== null && isIpAllowed(ip),
    ip,
    networks: getAdminTrustedNetworkLabels(),
  };
}
