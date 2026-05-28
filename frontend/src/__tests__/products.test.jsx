import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import App from "../App.jsx";

const products = [
  {
    id: 1,
    name: "Trail Backpack",
    description: "Weather resistant day pack",
    price: 129.99,
    stock: 8,
    image_url: "https://example.com/backpack.jpg",
  },
  {
    id: 2,
    name: "City Tote",
    description: "Compact everyday bag",
    price: 49.5,
    stock: 0,
    image_url: "https://example.com/tote.jpg",
  },
];

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
});

function mockProductFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (url === "/products") {
      return {
        ok: true,
        status: 200,
        json: async () => products,
      };
    }
    if (url === "/products/1") {
      return {
        ok: true,
        status: 200,
        json: async () => products[0],
      };
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
}

describe("product catalog", () => {
  it("loads products on the homepage and filters them by name", async () => {
    const user = userEvent.setup();
    mockProductFetch();

    render(<App />);

    expect(await screen.findByRole("heading", { name: /products/i })).toBeInTheDocument();
    expect(screen.getByText("Trail Backpack")).toBeInTheDocument();
    expect(screen.getByText("City Tote")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /add to cart/i })).toHaveLength(2);

    await user.type(screen.getByRole("searchbox", { name: /search products/i }), "trail");

    expect(screen.getByText("Trail Backpack")).toBeInTheDocument();
    expect(screen.queryByText("City Tote")).not.toBeInTheDocument();
  });

  it("navigates from a product card to the product detail page", async () => {
    const user = userEvent.setup();
    mockProductFetch();

    render(<App />);

    const card = await screen.findByTestId("product-card-1");
    await user.click(within(card).getByRole("link", { name: /trail backpack/i }));

    expect(await screen.findByRole("heading", { name: "Trail Backpack" })).toBeInTheDocument();
    expect(screen.getByText("Weather resistant day pack")).toBeInTheDocument();
    expect(screen.getByText(/8 in stock/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/products/1");
  });
});
