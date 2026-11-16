import { describe, expect, it, vi } from "vitest";
import { expandShortLink } from "@/lib/route-overlay/parse-maps-url";
import {
  isAllowlistedMapsHost,
  isNonPublicAddress,
} from "@/lib/route-overlay/redirect-policy";
import { SAMPLES } from "@/lib/route-overlay/samples";

const SHORT = "https://maps.app.goo.gl/abcDEF123";
const PUBLIC_IP = "142.250.190.14";
const FULL = SAMPLES[1].url;

function publicResolver(addresses: string[] = [PUBLIC_IP]) {
  return vi.fn(async () => addresses);
}

function recordingFetch(locationFor: (url: string) => string | null) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(init?.redirect).toBe("manual");
    const location = locationFor(url);
    if (location) {
      return new Response(null, { status: 302, headers: { Location: location } });
    }
    return new Response("<html></html>", { status: 200 });
  });
  return { calls, fetchImpl };
}

describe("expandShortLink redirect guard", () => {
  it("follows an allowlisted maps.app.goo.gl redirect to a full Maps URL", async () => {
    const { calls, fetchImpl } = recordingFetch((url) =>
      url === SHORT ? FULL : null,
    );
    const result = await expandShortLink(SHORT, fetchImpl, 4000, {
      resolveHost: publicResolver(),
    });
    expect(result).toEqual({ ok: true, url: FULL });
    expect(calls).toEqual([SHORT, FULL]);
  });

  it("follows a goo.gl/maps redirect and a google.com.br Maps target", async () => {
    const source = "https://goo.gl/maps/HcikiDXFwN2coeFN8";
    const target = "https://www.google.com.br/maps/dir/Santos/Montevideo";
    const { calls, fetchImpl } = recordingFetch((url) =>
      url === source ? target : null,
    );
    const result = await expandShortLink(source, fetchImpl, 4000, {
      resolveHost: publicResolver(),
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([source, target]);
  });

  it.each([
    ["https://evil.example/maps"],
    ["https://google.com.evil.com/maps"],
    ["https://maps.google.evil.com/maps/dir/A/B"],
    ["https://maps.app.goo.gl.evil.com/abc"],
    ["http://www.google.com/maps/dir/A/B"],
    ["https://127.0.0.1/maps"],
    ["https://0x7f000001/maps"],
    ["https://2130706433/maps"],
    ["https://[::1]/maps"],
    ["https://169.254.169.254/latest/meta-data"],
    ["https://10.1.2.3/maps"],
    ["https://192.168.0.8/maps"],
    ["https://172.16.0.4/maps"],
    ["https://localhost/maps"],
    ["https://user:pass@www.google.com/maps/dir/A/B"],
    ["https://www.google.com:8443/maps/dir/A/B"],
    ["file:///C:/Windows/win.ini"],
    ["https://www.google.com/search?q=maps"],
    ["https://metadata.google.internal/"],
  ])("does not fetch unsafe redirect target %s", async (target) => {
    const resolveHost = publicResolver();
    const { calls, fetchImpl } = recordingFetch(() => target);
    const result = await expandShortLink(SHORT, fetchImpl, 4000, { resolveHost });
    expect(result.ok).toBe(false);
    expect(calls).toEqual([SHORT]);
    expect(resolveHost).not.toHaveBeenCalledWith(new URL(target, SHORT).hostname);
  });

  it("does not fetch a later hop after the redirect limit", async () => {
    const hops = Array.from({ length: 8 }, (_, index) => `${SHORT}${index}`);
    const { calls, fetchImpl } = recordingFetch((url) => {
      const index = hops.indexOf(url);
      return index === -1 || index === hops.length - 1 ? null : hops[index + 1];
    });
    const result = await expandShortLink(hops[0], fetchImpl, 4000, {
      resolveHost: publicResolver(),
    });
    expect(result.ok).toBe(false);
    expect(calls).toEqual(hops.slice(0, 6));
    expect(calls).not.toContain(hops[6]);
    expect(calls).not.toContain(hops[7]);
  });

  it.each([
    ["10.0.0.8"],
    ["127.0.0.1"],
    ["169.254.169.254"],
    ["192.168.1.20"],
    ["::1"],
    ["fe80::1"],
    ["fd00::1"],
    ["::ffff:127.0.0.1"],
  ])("does not fetch an allowlisted host that resolves to %s", async (address) => {
    const { calls, fetchImpl } = recordingFetch(() => FULL);
    const result = await expandShortLink(SHORT, fetchImpl, 4000, {
      resolveHost: async (hostname) => {
        if (hostname === "www.google.com") {
          return [address];
        }
        return [PUBLIC_IP];
      },
    });
    expect(result.ok).toBe(false);
    expect(calls).toEqual([SHORT]);
  });

  it("does not fetch when resolution fails or includes any private address", async () => {
    const failed = recordingFetch(() => FULL);
    const failure = await expandShortLink(SHORT, failed.fetchImpl, 4000, {
      resolveHost: async () => {
        throw new Error("dns failed");
      },
    });
    expect(failure.ok).toBe(false);
    expect(failed.calls).toEqual([]);

    const mixed = recordingFetch(() => FULL);
    const mixedResult = await expandShortLink(SHORT, mixed.fetchImpl, 4000, {
      resolveHost: async () => [PUBLIC_IP, "10.0.0.1"],
    });
    expect(mixedResult.ok).toBe(false);
    expect(mixed.calls).toEqual([]);
  });

  it("does not fetch a non-short-link host", async () => {
    const fetchImpl = vi.fn();
    const result = await expandShortLink("https://google.com.evil.com/maps/dir/A/B", fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("maps hostname allowlist", () => {
  it("accepts exact Google Maps hosts and rejects prefix lookalikes", () => {
    expect(isAllowlistedMapsHost("www.google.com")).toBe(true);
    expect(isAllowlistedMapsHost("maps.google.com")).toBe(true);
    expect(isAllowlistedMapsHost("www.google.com.br")).toBe(true);
    expect(isAllowlistedMapsHost("www.google.co.uk.")).toBe(true);
    expect(isAllowlistedMapsHost("maps.app.goo.gl")).toBe(true);
    expect(isAllowlistedMapsHost("google.evil.com")).toBe(false);
    expect(isAllowlistedMapsHost("google.com.evil.com")).toBe(false);
    expect(isAllowlistedMapsHost("maps.google.evil.com")).toBe(false);
    expect(isAllowlistedMapsHost("notgoogle.com")).toBe(false);
  });
});

describe("non-public addresses", () => {
  it("classifies local and public addresses", () => {
    const privateAddresses = [
      "0.0.0.0",
      "10.255.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
      "2002:7f00:1::",
      "64:ff9b::127.0.0.1",
    ];
    for (const address of privateAddresses) {
      expect(isNonPublicAddress(address), address).toBe(true);
    }
    expect(isNonPublicAddress("8.8.8.8")).toBe(false);
    expect(isNonPublicAddress("142.250.190.14")).toBe(false);
    expect(isNonPublicAddress("172.15.0.1")).toBe(false);
    expect(isNonPublicAddress("172.32.0.1")).toBe(false);
    expect(isNonPublicAddress("2001:4860:4860::8888")).toBe(false);
    expect(isNonPublicAddress("::ffff:8.8.8.8")).toBe(false);
  });
});
