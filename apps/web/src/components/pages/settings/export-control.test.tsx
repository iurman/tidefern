import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ GET: vi.fn(), goTo: vi.fn() }));

vi.mock("@/lib/api-browser", () => ({ browserApiClient: () => ({ GET: api.GET }) }));
vi.mock("./navigate", () => ({ goTo: api.goTo }));

const { ExportControl } = await import("./export-control");

const lines = [
  JSON.stringify({
    kind: "export",
    format: 1,
    subjectId: "s",
    generatedAt: "2026-10-06T12:00:00Z",
  }),
  JSON.stringify({ kind: "profile", data: {} }),
  JSON.stringify({ kind: "note", data: {} }),
];

function answered(status: number, data: unknown, error?: unknown) {
  return { data, error, response: new Response(null, { status }) };
}

const freshAuthProblem = {
  type: "urn:tidefern:problem:unauthenticated",
  title: "Sign in required",
  status: 401,
  code: "unauthenticated",
  detail: "fresh_authentication_required",
};

let clicked: HTMLAnchorElement[] = [];

beforeEach(() => {
  api.GET.mockReset();
  api.goTo.mockReset();
  clicked = [];
  // jsdom has no object URLs; the file itself is the Blob the control keeps.
  for (const [name, value] of [
    ["createObjectURL", vi.fn(() => "blob:file")],
    ["revokeObjectURL", vi.fn()],
  ] as const) {
    Object.defineProperty(URL, name, { value, configurable: true, writable: true });
  }
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("download my data", () => {
  it("reads the export as text and hands over the file only when its end line is there", async () => {
    const user = userEvent.setup();
    api.GET.mockResolvedValue(
      answered(200, [...lines, JSON.stringify({ kind: "end", records: 2 })].join("\n")),
    );
    render(<ExportControl returnTo="/settings" freshForMs={300_000} />);
    await user.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByText(/Your file is ready, with 2 records/)).toBeVisible();
    expect(api.GET).toHaveBeenCalledWith("/api/v1/me/export", { parseAs: "text" });
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe("tidefern-export.ndjson");
    await user.click(screen.getByRole("button", { name: "Save the file again" }));
    expect(clicked).toHaveLength(2);
  });

  it("says a file cut off partway is incomplete and offers nothing to save", async () => {
    const user = userEvent.setup();
    api.GET.mockResolvedValue(answered(200, lines.join("\n")));
    render(<ExportControl returnTo="/settings" freshForMs={300_000} />);
    await user.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByText(/stopped partway, so the file is incomplete/)).toBeVisible();
    expect(clicked).toHaveLength(0);
  });

  it("turns a refusal for an old sign-in into the step to sign in again, returning here", async () => {
    const user = userEvent.setup();
    api.GET.mockResolvedValue(answered(401, undefined, freshAuthProblem));
    render(<ExportControl returnTo="/settings/export" freshForMs={null} />);
    await user.click(screen.getByRole("button", { name: "Download my data" }));
    const notice = await screen.findByText(
      /downloading your data needs a sign-in from the last ten minutes/,
    );
    expect(notice.closest("[data-tone]")).toHaveAttribute("data-tone", "error");
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fsettings%2Fexport",
    );
    expect(screen.queryByRole("button", { name: "Download my data" })).toBeNull();
  });

  it("asks for the fresh sign-in first when the session is already too old for it", () => {
    render(<ExportControl returnTo="/settings" freshForMs={0} />);
    const notice = screen.getByText(/downloading your data needs a sign-in/);
    expect(notice.closest("[data-tone]")).toHaveAttribute("data-tone", "info");
    expect(screen.queryByRole("button", { name: "Download my data" })).toBeNull();
  });

  it("names the next step when the server fails or cannot be reached", async () => {
    const user = userEvent.setup();
    api.GET.mockResolvedValueOnce(answered(500, undefined, { code: "internal", status: 500 }));
    api.GET.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ExportControl returnTo="/settings" freshForMs={300_000} />);
    await user.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByText(/problem on our side/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Download my data" }));
    expect(await screen.findByText(/Check your connection/)).toBeVisible();
  });
});
