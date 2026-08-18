import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Routely",
  version: packageJson.version,
  copyright: `© ${currentYear}, Routely LLC.`,
  meta: {
    title: "Routely — Admin Console",
    description: "Routely staff console for operating medical courier stops, routes, tenants, and billing.",
  },
};
