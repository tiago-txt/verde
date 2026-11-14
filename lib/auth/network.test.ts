import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAdminNetworkStatus,
  getClientIp,
  isIpAllowed,
} from "./network";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

beforeEach(() => {
  delete process.env.ADMIN_TRUSTED_NETWORKS;
});

afterEach(() => {
  delete process.env.ADMIN_TRUSTED_NETWORKS;
});

describe("IP do cliente", () => {
  it("usa a entrada mais à direita do X-Forwarded-For", () => {
    expect(
      getClientIp(
        headers({ "x-forwarded-for": "203.0.113.9, 192.168.1.20" }),
      ),
    ).toBe("192.168.1.20");
  });

  it("remove porta e normaliza IPv4 mapeado em IPv6", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "192.168.1.5:51234" }))).toBe(
      "192.168.1.5",
    );
    expect(
      getClientIp(headers({ "x-forwarded-for": "::ffff:192.168.1.5" })),
    ).toBe("192.168.1.5");
    expect(getClientIp(headers({ "x-forwarded-for": "[::1]:3000" }))).toBe(
      "::1",
    );
  });

  it("cai para X-Real-IP quando não há X-Forwarded-For", () => {
    expect(getClientIp(headers({ "x-real-ip": "10.0.0.8" }))).toBe("10.0.0.8");
  });

  it("retorna null sem IP válido", () => {
    expect(getClientIp(headers({}))).toBeNull();
    expect(getClientIp(headers({ "x-forwarded-for": "desconhecido" }))).toBeNull();
  });
});

describe("rede confiável do administrador", () => {
  it("aceita loopback e faixas privadas por padrão", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.10",
      "169.254.10.20",
      "::1",
      "fe80::1",
      "fd12:3456::1",
    ]) {
      expect(isIpAllowed(ip), ip).toBe(true);
    }
  });

  it("rejeita IPs públicos e faixas próximas mas fora do CIDR", () => {
    for (const ip of [
      "172.32.0.1",
      "100.64.0.1",
      "203.0.113.7",
      "8.8.8.8",
      "2001:db8::1",
    ]) {
      expect(isIpAllowed(ip), ip).toBe(false);
    }
  });

  it("respeita ADMIN_TRUSTED_NETWORKS quando definido", () => {
    process.env.ADMIN_TRUSTED_NETWORKS = "203.0.113.0/24, 198.51.100.42";

    expect(isIpAllowed("203.0.113.55")).toBe(true);
    expect(isIpAllowed("198.51.100.42")).toBe(true);
    // A lista configurada substitui o padrão.
    expect(isIpAllowed("192.168.1.10")).toBe(false);
  });

  it("aceita '*' como liberação total e ignora entradas inválidas", () => {
    process.env.ADMIN_TRUSTED_NETWORKS = "*";
    expect(isIpAllowed("8.8.8.8")).toBe(true);
    expect(isIpAllowed("2001:db8::1")).toBe(true);

    process.env.ADMIN_TRUSTED_NETWORKS = "nao-e-um-ip, 999.1.1.1/24";
    expect(isIpAllowed("192.168.1.10")).toBe(false);
  });
});

describe("status de acesso administrativo", () => {
  it("marca a requisição como permitida e expõe o IP normalizado", () => {
    const status = getAdminNetworkStatus(
      headers({ "x-forwarded-for": "203.0.113.9, 192.168.1.20" }),
    );

    expect(status.allowed).toBe(true);
    expect(status.ip).toBe("192.168.1.20");
    expect(status.networks.length).toBeGreaterThan(0);
  });

  it("bloqueia quando o IP está fora da lista", () => {
    const status = getAdminNetworkStatus(
      headers({ "x-forwarded-for": "203.0.113.9" }),
    );

    expect(status.allowed).toBe(false);
    expect(status.ip).toBe("203.0.113.9");
  });

  it("bloqueia quando o IP não pode ser identificado", () => {
    expect(getAdminNetworkStatus(headers({})).allowed).toBe(false);
  });
});
