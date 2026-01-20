// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  cities: {
    allow: {
      view: "true",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  buffets: {
    allow: {
      view: "true",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  menus: {
    allow: {
      view: "true",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
} satisfies InstantRules;

export default rules;
