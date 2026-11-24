import { describe, expect, it } from "vitest";
import { cityNeighborhoods, findNeighborhood } from "../src/lib/neighborhoods";

describe("findNeighborhood", () => {
  const list = ["Centro", "São Bento", "Vila Nova II"];

  it("devolve a grafia da lista, sem ligar para acento e maiúsculas", () => {
    expect(findNeighborhood(list, "sao bento")).toBe("São Bento");
  });

  it("ignora espaços sobrando", () => {
    expect(findNeighborhood(list, " centro ")).toBe("Centro");
    expect(findNeighborhood(list, "vila   nova ii")).toBe("Vila Nova II");
  });

  it("devolve null para nome fora da lista", () => {
    expect(findNeighborhood(list, "bcdhubscu")).toBeNull();
  });
});

describe("cityNeighborhoods", () => {
  it("lê a lista de Bento Gonçalves", () => {
    const list = cityNeighborhoods("Bento Gonçalves", "RS");
    expect(list).toEqual(expect.arrayContaining(["Centro", "São Bento"]));
  });

  it("devolve null para cidade sem arquivo", () => {
    expect(cityNeighborhoods("Cidade Que Não Existe", "XX")).toBeNull();
  });

  it("devolve null sem cidade configurada", () => {
    expect(cityNeighborhoods("", "")).toBeNull();
  });
});
