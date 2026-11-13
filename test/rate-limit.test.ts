import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { rateLimit } from "../src/lib/rate-limit";

function call(limiter: ReturnType<typeof rateLimit>, ip: string) {
  const req = { ip } as Request;
  const res = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json() { return this; },
    setHeader() {},
  } as unknown as Response & { statusCode: number };
  const next = vi.fn();
  limiter(req, res, next);
  return { allowed: next.mock.calls.length === 1, status: res.statusCode };
}

describe("rateLimit", () => {
  it("deixa passar até o limite e bloqueia depois", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });
    expect(call(limiter, "1.1.1.1").allowed).toBe(true);
    expect(call(limiter, "1.1.1.1").allowed).toBe(true);
    expect(call(limiter, "1.1.1.1")).toEqual({ allowed: false, status: 429 });
  });

  it("conta cada IP separado", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    expect(call(limiter, "1.1.1.1").allowed).toBe(true);
    expect(call(limiter, "2.2.2.2").allowed).toBe(true);
  });

  it("libera de novo depois da janela", () => {
    vi.useFakeTimers();
    const limiter = rateLimit({ windowMs: 1000, max: 1 });
    expect(call(limiter, "1.1.1.1").allowed).toBe(true);
    expect(call(limiter, "1.1.1.1").allowed).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(call(limiter, "1.1.1.1").allowed).toBe(true);
    vi.useRealTimers();
  });
});
