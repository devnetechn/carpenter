export interface ServiceQuestionOption {
  id: string;
  label: string;
  fieldType: "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN" | "TEXTAREA";
  options: string[] | null;
  required: boolean;
}

export interface ServiceOption {
  id: string;
  name: string;
  slug: string;
  description: string;
  questions: ServiceQuestionOption[];
}

export interface WizardData {
  serviceId: string;
  serviceSlug: string;
  answers: Record<string, string>;
  photoUrls: string[];
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  withinServiceArea: boolean | null;
  budgetMin: string;
  budgetMax: string;
  slotStart: string;
  slotEnd: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  preferredContact: "EMAIL" | "PHONE" | "TEXT";
}

export const INITIAL_WIZARD_DATA: WizardData = {
  serviceId: "",
  serviceSlug: "",
  answers: {},
  photoUrls: [],
  addressStreet: "",
  addressCity: "",
  addressState: "",
  addressZip: "",
  withinServiceArea: null,
  budgetMin: "",
  budgetMax: "",
  slotStart: "",
  slotEnd: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  preferredContact: "EMAIL",
};
