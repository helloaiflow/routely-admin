import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Routely Admin",
  version: packageJson.version,
  copyright: `© ${currentYear}, Routely LLC.`,
  meta: {
    title: "Routely Admin — Operations Portal",
    description:
      "Routely Admin is the operations portal for managing pharmacy deliveries, package scans, stops, drivers, and AI-powered courier logistics.",
  },
};
