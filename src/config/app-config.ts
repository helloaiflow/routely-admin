import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Routely",
  version: packageJson.version,
  copyright: `© ${currentYear}, Routely LLC.`,
  meta: {
    title: "Routely — Client Portal",
    description: "Routely client portal for managing medical courier deliveries, orders, and routes.",
  },
};
