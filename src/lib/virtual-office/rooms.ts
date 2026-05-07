export interface Room {
  id: string; label: string; description: string;
  x: number; y: number; w: number; h: number;
  color: string; borderColor: string; department: string;
}
export const ROOMS: Room[] = [
  { id: "main_hall",   label: "Main Workstation Hall", description: "Primary ops — dispatch, intake, scheduling", x: 5,  y: 5,  w: 48, h: 55, color: "#0F172A", borderColor: "#1E40AF", department: "Operations"     },
  { id: "reception",   label: "Reception & Waiting",   description: "Client onboarding and front desk",           x: 5,  y: 62, w: 22, h: 32, color: "#0F172A", borderColor: "#4338CA", department: "CRM"            },
  { id: "lounge",      label: "Client Lounge",          description: "Escalation and client meetings",             x: 29, y: 62, w: 24, h: 32, color: "#0F172A", borderColor: "#7C3AED", department: "Support"        },
  { id: "boss_cabin",  label: "Command Center",          description: "Compliance and executive oversight",         x: 55, y: 5,  w: 40, h: 28, color: "#0F172A", borderColor: "#0EA5E9", department: "Legal"          },
  { id: "accounts",    label: "Finance & QA",            description: "Billing, invoicing, quality assurance",      x: 55, y: 35, w: 40, h: 24, color: "#0F172A", borderColor: "#059669", department: "Finance"        },
  { id: "staff_room",  label: "Communications",          description: "Voice agents, VAPI, calls",                  x: 55, y: 61, w: 20, h: 18, color: "#0F172A", borderColor: "#0167FF", department: "Communications" },
  { id: "centre_head", label: "Analytics Hub",           description: "Data analysis and reporting",                x: 55, y: 81, w: 20, h: 13, color: "#0F172A", borderColor: "#0167FF", department: "Analytics"      },
  { id: "counsellor",  label: "Support Room",            description: "Exception handling and support",             x: 77, y: 61, w: 18, h: 33, color: "#0F172A", borderColor: "#10A37F", department: "Support"        },
];
