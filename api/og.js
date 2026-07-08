// api/og.js
//
// Open Graph card for link previews (LinkedIn, Slack, iMessage, X).
// Runs on the Edge runtime; @vercel/og renders the element tree to a
// 1200x630 PNG. Written as plain element objects so no JSX build step is
// needed for the api folder.

import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

// Tiny helper: h(type, props, ...children) -> satori element
const h = (type, props, ...children) => ({
  type,
  props: {
    ...props,
    ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}),
  },
});

const dot = (color) =>
  h("div", {
    style: {
      width: 14,
      height: 14,
      borderRadius: 9999,
      backgroundColor: color,
    },
  });

const chip = (color, label) =>
  h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 22px",
        borderRadius: 9999,
        border: "1px solid #e7e5e4",
        backgroundColor: "#ffffff",
        color: "#44403c",
        fontSize: 26,
      },
    },
    dot(color),
    label
  );

export default function handler() {
  return new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          backgroundColor: "#fafaf9",
          fontFamily: "sans-serif",
        },
      },
      // Brand row: pulse mark + name
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 28 } },
        h(
          "div",
          {
            style: {
              width: 88,
              height: 88,
              borderRadius: 20,
              backgroundColor: "#1c1917",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
          },
          h("svg", {
            width: 60,
            height: 60,
            viewBox: "0 0 64 64",
            children: h("path", {
              d: "M10 34h11l5-13 9 25 6-17 4 5h9",
              fill: "none",
              stroke: "#fafaf9",
              strokeWidth: 4.5,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }),
          }),
        ),
        h(
          "div",
          {
            style: {
              fontSize: 76,
              fontWeight: 700,
              color: "#1c1917",
              letterSpacing: -2,
            },
          },
          "Decision Vitals"
        )
      ),
      // Tagline
      h(
        "div",
        {
          style: {
            marginTop: 36,
            fontSize: 34,
            lineHeight: 1.4,
            color: "#57534e",
            maxWidth: 900,
          },
        },
        "Vital signs for the decisions you've already made. AI agents watch the assumptions behind a decision and flag when the evidence turns against one."
      ),
      // Status chips
      h(
        "div",
        { style: { display: "flex", gap: 20, marginTop: 48 } },
        chip("#10b981", "Healthy"),
        chip("#f59e0b", "Watch"),
        chip("#f43f5e", "At Risk")
      )
    ),
    { width: 1200, height: 630 }
  );
}
