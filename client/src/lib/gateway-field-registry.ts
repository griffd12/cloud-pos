export type IntegrationModel = "direct" | "direct_with_terminal" | "semi_integrated";

export type GatewayFieldKey =
  | "credentialKeyPrefix" | "merchantId" | "terminalId" | "siteId" | "deviceId" | "licenseId"
  | "terminalIpAddress" | "terminalPort" | "terminalConnectionType"
  | "enableSale" | "enableVoid" | "enableRefund" | "enableAuthCapture" | "enableManualEntry"
  | "enableDebit" | "enableEbt" | "enableHealthcare"
  | "enableEmv" | "enableContactless" | "enableMsr"
  | "enablePartialApproval" | "enableTokenization" | "enableStoreAndForward"
  | "enableSurcharge" | "enableTipAdjust" | "enableIncrementalAuth" | "enableCashback"
  | "surchargePercent" | "safFloorLimit" | "safMaxTransactions" | "authHoldMinutes"
  | "enableAutoBatchClose" | "batchCloseTime" | "enableManualBatchClose"
  | "receiptShowEmvFields" | "receiptShowAid" | "receiptShowTvr" | "receiptShowTsi"
  | "receiptShowAppLabel" | "receiptShowEntryMethod" | "receiptPrintMerchantCopy" | "receiptPrintCustomerCopy"
  | "enableDebugLogging" | "logRawRequests" | "logRawResponses";

export interface GatewayFieldOverride {
  label?: string;
  description?: string;
  placeholder?: string;
}

export interface GatewayProfile {
  integrationModel: IntegrationModel;
  supportedFields: Set<GatewayFieldKey>;
  fieldOverrides: Partial<Record<GatewayFieldKey, GatewayFieldOverride>>;
  suggestedDefaults: Partial<Record<GatewayFieldKey, boolean | string | number>>;
  connectionFields: {
    label: string;
    description: string;
    placeholder: string;
    field: GatewayFieldKey;
  }[];
}

function fieldSet(...groups: GatewayFieldKey[][]): Set<GatewayFieldKey> {
  return new Set(groups.flat());
}

const TERMINAL_CONNECTION_FIELDS: GatewayFieldKey[] = [
  "terminalIpAddress", "terminalPort", "terminalConnectionType",
];

const UNIVERSAL_TRANSACTION_FIELDS: GatewayFieldKey[] = [
  "enableSale", "enableVoid", "enableRefund", "enableAuthCapture", "enableManualEntry",
];

const UNIVERSAL_FEATURES: GatewayFieldKey[] = [
  "enablePartialApproval", "enableTokenization", "enableTipAdjust",
  "surchargePercent", "authHoldMinutes",
];

const UNIVERSAL_BATCH: GatewayFieldKey[] = [
  "enableAutoBatchClose", "batchCloseTime", "enableManualBatchClose",
];

const UNIVERSAL_RECEIPT: GatewayFieldKey[] = [
  "receiptPrintMerchantCopy", "receiptPrintCustomerCopy",
  "receiptShowEntryMethod",
];

const EMV_RECEIPT_FIELDS: GatewayFieldKey[] = [
  "receiptShowEmvFields", "receiptShowAid", "receiptShowTvr", "receiptShowTsi", "receiptShowAppLabel",
];

const UNIVERSAL_DEBUG: GatewayFieldKey[] = [
  "enableDebugLogging", "logRawRequests", "logRawResponses",
];

const CARD_PRESENT_ENTRY: GatewayFieldKey[] = [
  "enableEmv", "enableContactless", "enableMsr",
];

const SEMI_INTEGRATED_TRANSACTION_FIELDS: GatewayFieldKey[] = [
  "enableSale", "enableVoid", "enableRefund", "enableAuthCapture",
];

const heartlandProfile: GatewayProfile = {
  integrationModel: "semi_integrated",
  supportedFields: fieldSet(
    TERMINAL_CONNECTION_FIELDS,
    ["credentialKeyPrefix", "merchantId", "terminalId"],
    SEMI_INTEGRATED_TRANSACTION_FIELDS,
    ["enablePartialApproval", "enableTipAdjust", "enableCashback"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "terminalIpAddress", label: "Terminal IP Address", description: "IP address of the Heartland payment terminal", placeholder: "192.168.1.100" },
    { field: "terminalPort", label: "Terminal Port", description: "Communication port for the Heartland terminal", placeholder: "12000" },
    { field: "terminalConnectionType", label: "Connection Type", description: "How the POS connects to the terminal", placeholder: "tcp" },
    { field: "merchantId", label: "Merchant ID (MID)", description: "Heartland-assigned MID (for reporting reference)", placeholder: "Heartland MID" },
    { field: "terminalId", label: "Terminal ID (TID)", description: "Heartland terminal identifier (for reporting reference)", placeholder: "Terminal ID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., HEARTLAND_MAIN)", placeholder: "HEARTLAND_MAIN" },
  ],
  fieldOverrides: {},
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enableAuthCapture: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptShowAid: true,
    receiptShowAppLabel: true,
    receiptShowEntryMethod: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
    terminalPort: "12000",
    terminalConnectionType: "tcp",
  },
};

const elavonConvergeProfile: GatewayProfile = {
  integrationModel: "semi_integrated",
  supportedFields: fieldSet(
    TERMINAL_CONNECTION_FIELDS,
    ["credentialKeyPrefix", "merchantId", "terminalId"],
    SEMI_INTEGRATED_TRANSACTION_FIELDS,
    ["enablePartialApproval", "enableTipAdjust"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "terminalIpAddress", label: "Terminal IP Address", description: "IP address of the Elavon Converge payment terminal", placeholder: "192.168.1.100" },
    { field: "terminalPort", label: "Terminal Port", description: "Communication port for the Converge terminal", placeholder: "8080" },
    { field: "terminalConnectionType", label: "Connection Type", description: "How the POS connects to the terminal", placeholder: "tcp" },
    { field: "merchantId", label: "Converge Merchant ID", description: "Elavon Converge MID (for reporting reference)", placeholder: "Converge MID" },
    { field: "terminalId", label: "Converge Terminal ID", description: "Converge terminal identifier", placeholder: "Converge TID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., ELAVON_CONVERGE)", placeholder: "ELAVON_CONVERGE" },
  ],
  fieldOverrides: {},
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
    terminalPort: "8080",
    terminalConnectionType: "tcp",
  },
};

const elavonFuseboxProfile: GatewayProfile = {
  integrationModel: "semi_integrated",
  supportedFields: fieldSet(
    TERMINAL_CONNECTION_FIELDS,
    ["credentialKeyPrefix", "merchantId", "terminalId", "deviceId"],
    SEMI_INTEGRATED_TRANSACTION_FIELDS,
    ["enablePartialApproval", "enableTipAdjust"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "terminalIpAddress", label: "Terminal IP Address", description: "IP address of the Elavon Fusebox payment terminal", placeholder: "192.168.1.100" },
    { field: "terminalPort", label: "Terminal Port", description: "Communication port for the Fusebox terminal", placeholder: "443" },
    { field: "terminalConnectionType", label: "Connection Type", description: "How the POS connects to the terminal", placeholder: "tcp" },
    { field: "merchantId", label: "Fusebox Merchant ID", description: "Elavon Fusebox MID (for reporting reference)", placeholder: "Fusebox MID" },
    { field: "terminalId", label: "Fusebox Terminal ID", description: "Fusebox terminal identifier", placeholder: "Fusebox TID" },
    { field: "deviceId", label: "Lane ID", description: "Fusebox lane/device identifier for this terminal", placeholder: "Lane ID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., ELAVON_FUSEBOX)", placeholder: "ELAVON_FUSEBOX" },
  ],
  fieldOverrides: {
    deviceId: { label: "Lane ID", description: "Fusebox lane/device identifier" },
  },
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
    terminalPort: "443",
    terminalConnectionType: "tcp",
  },
};

const stripeProfile: GatewayProfile = {
  integrationModel: "direct_with_terminal",
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId"],
    UNIVERSAL_TRANSACTION_FIELDS,
    UNIVERSAL_FEATURES,
    ["enableSurcharge"],
    UNIVERSAL_BATCH,
    ["receiptPrintCustomerCopy"],
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "merchantId", label: "Stripe Account ID", description: "Your Stripe account identifier (acct_...)", placeholder: "acct_..." },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., STRIPE_MAIN)", placeholder: "STRIPE_MAIN" },
  ],
  fieldOverrides: {
    merchantId: { label: "Stripe Account ID", description: "Stripe Connect account identifier", placeholder: "acct_..." },
    enableManualEntry: { label: "Card-Not-Present", description: "Online / keyed card transactions (Stripe default)" },
  },
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enableTokenization: true,
    enablePartialApproval: true,
    receiptPrintCustomerCopy: true,
  },
};

const northIngenicoProfile: GatewayProfile = {
  integrationModel: "semi_integrated",
  supportedFields: fieldSet(
    TERMINAL_CONNECTION_FIELDS,
    ["credentialKeyPrefix", "merchantId", "terminalId", "deviceId"],
    SEMI_INTEGRATED_TRANSACTION_FIELDS,
    ["enablePartialApproval", "enableTipAdjust", "enableCashback"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "terminalIpAddress", label: "Ingenico Cloud API Endpoint", description: "Cloud WebSocket API endpoint URL or terminal IP address", placeholder: "wss://api.ingenico.com" },
    { field: "terminalPort", label: "Terminal Port", description: "Communication port for the Ingenico terminal", placeholder: "443" },
    { field: "terminalConnectionType", label: "Connection Type", description: "How the POS connects to the terminal", placeholder: "cloud_websocket" },
    { field: "merchantId", label: "North Merchant ID", description: "North/TSYS MID (for reporting reference)", placeholder: "North MID" },
    { field: "terminalId", label: "Terminal ID", description: "Ingenico terminal serial number or ID", placeholder: "Terminal SN" },
    { field: "deviceId", label: "Ingenico Device ID", description: "Cloud WebSocket API device identifier", placeholder: "Ingenico Device ID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., NORTH_MAIN)", placeholder: "NORTH_MAIN" },
  ],
  fieldOverrides: {
    deviceId: { label: "Ingenico Device ID", description: "Cloud WebSocket API device identifier" },
  },
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
    terminalPort: "443",
    terminalConnectionType: "cloud_websocket",
  },
};

const shift4Profile: GatewayProfile = {
  integrationModel: "semi_integrated",
  supportedFields: fieldSet(
    TERMINAL_CONNECTION_FIELDS,
    ["credentialKeyPrefix", "merchantId", "terminalId", "deviceId"],
    SEMI_INTEGRATED_TRANSACTION_FIELDS,
    ["enablePartialApproval", "enableTipAdjust", "enableCashback"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "terminalIpAddress", label: "UTG IP Address", description: "IP address of the Shift4 UTG (Universal Transaction Gateway)", placeholder: "192.168.1.100" },
    { field: "terminalPort", label: "UTG Port", description: "Communication port for the Shift4 UTG", placeholder: "5015" },
    { field: "terminalConnectionType", label: "Connection Type", description: "How the POS connects to the UTG", placeholder: "tcp" },
    { field: "merchantId", label: "Shift4 Merchant ID", description: "Shift4 merchant account identifier", placeholder: "Shift4 MID" },
    { field: "terminalId", label: "Terminal Serial Number", description: "Shift4 terminal serial number", placeholder: "Terminal SN" },
    { field: "deviceId", label: "Device GUID", description: "Shift4 device GUID from UTG registration", placeholder: "Device GUID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., SHIFT4_MAIN)", placeholder: "SHIFT4_MAIN" },
  ],
  fieldOverrides: {
    deviceId: { label: "Device GUID", description: "Shift4 device GUID from UTG registration" },
    terminalId: { label: "Terminal Serial Number", description: "Shift4 terminal serial number" },
  },
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
    terminalPort: "5015",
    terminalConnectionType: "tcp",
  },
};

const freedompayProfile: GatewayProfile = {
  integrationModel: "semi_integrated",
  supportedFields: fieldSet(
    TERMINAL_CONNECTION_FIELDS,
    ["credentialKeyPrefix", "merchantId", "terminalId", "deviceId"],
    SEMI_INTEGRATED_TRANSACTION_FIELDS,
    ["enablePartialApproval", "enableTipAdjust", "enableCashback"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "terminalIpAddress", label: "FreedomPay API Endpoint", description: "FreedomPay API endpoint URL", placeholder: "https://api.freedompay.com" },
    { field: "terminalPort", label: "Terminal Port", description: "Communication port for the FreedomPay terminal", placeholder: "443" },
    { field: "terminalConnectionType", label: "Connection Type", description: "How the POS connects to FreedomPay", placeholder: "tcp" },
    { field: "merchantId", label: "FreedomPay Store ID", description: "FreedomPay store identifier", placeholder: "Store ID" },
    { field: "terminalId", label: "FreedomPay Terminal ID", description: "FreedomPay terminal identifier", placeholder: "Terminal ID" },
    { field: "deviceId", label: "FreedomPay POI Device ID", description: "Point of Interaction device identifier", placeholder: "POI Device ID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., FREEDOMPAY_MAIN)", placeholder: "FREEDOMPAY_MAIN" },
  ],
  fieldOverrides: {
    merchantId: { label: "FreedomPay Store ID", description: "FreedomPay store identifier" },
    deviceId: { label: "POI Device ID", description: "FreedomPay Point of Interaction device identifier" },
  },
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
    terminalPort: "443",
    terminalConnectionType: "tcp",
  },
};

const eigenProfile: GatewayProfile = {
  integrationModel: "semi_integrated",
  supportedFields: fieldSet(
    TERMINAL_CONNECTION_FIELDS,
    ["credentialKeyPrefix", "merchantId", "terminalId"],
    SEMI_INTEGRATED_TRANSACTION_FIELDS,
    ["enablePartialApproval", "enableTipAdjust"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "terminalIpAddress", label: "Terminal IP Address", description: "IP address of the Eigen payment terminal", placeholder: "192.168.1.100" },
    { field: "terminalPort", label: "Terminal Port", description: "Communication port for the Eigen terminal", placeholder: "8080" },
    { field: "terminalConnectionType", label: "Connection Type", description: "How the POS connects to the terminal", placeholder: "tcp" },
    { field: "merchantId", label: "Eigen Merchant ID", description: "Eigen-assigned MID (for reporting reference)", placeholder: "Eigen MID" },
    { field: "terminalId", label: "Eigen Terminal ID", description: "Eigen terminal identifier", placeholder: "Eigen TID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., EIGEN_MAIN)", placeholder: "EIGEN_MAIN" },
  ],
  fieldOverrides: {},
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
    terminalPort: "8080",
    terminalConnectionType: "tcp",
  },
};

const fallbackProfile: GatewayProfile = {
  integrationModel: "direct",
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId", "terminalId", "siteId", "deviceId", "licenseId"],
    TERMINAL_CONNECTION_FIELDS,
    UNIVERSAL_TRANSACTION_FIELDS,
    ["enableDebit", "enableEbt", "enableHealthcare"],
    CARD_PRESENT_ENTRY,
    UNIVERSAL_FEATURES,
    ["enableStoreAndForward", "enableSurcharge", "enableIncrementalAuth", "enableCashback", "safFloorLimit", "safMaxTransactions"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "merchantId", label: "Merchant ID (MID)", description: "Processor-assigned merchant identifier", placeholder: "Merchant ID" },
    { field: "terminalId", label: "Terminal ID (TID)", description: "Processor-assigned terminal identifier", placeholder: "Terminal ID" },
    { field: "siteId", label: "Site ID", description: "Site-level identifier (if required)", placeholder: "Site ID" },
    { field: "deviceId", label: "Device ID", description: "Device-level identifier (if required)", placeholder: "Device ID" },
    { field: "licenseId", label: "License ID", description: "License identifier (if required)", placeholder: "License ID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix", placeholder: "PREFIX" },
  ],
  fieldOverrides: {},
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
  },
};

const GATEWAY_PROFILES: Record<string, GatewayProfile> = {
  heartland: heartlandProfile,
  elavon_converge: elavonConvergeProfile,
  elavon_fusebox: elavonFuseboxProfile,
  stripe: stripeProfile,
  north_ingenico: northIngenicoProfile,
  shift4: shift4Profile,
  freedompay: freedompayProfile,
  eigen: eigenProfile,
};

export function getGatewayProfile(gatewayType: string): GatewayProfile {
  return GATEWAY_PROFILES[gatewayType] || fallbackProfile;
}

export function getIntegrationModel(gatewayType: string): IntegrationModel {
  const profile = getGatewayProfile(gatewayType);
  return profile.integrationModel;
}

export function isSemiIntegrated(gatewayType: string): boolean {
  return getIntegrationModel(gatewayType) === "semi_integrated";
}

export function isFieldSupported(gatewayType: string, field: GatewayFieldKey): boolean {
  const profile = getGatewayProfile(gatewayType);
  return profile.supportedFields.has(field);
}

export function getFieldOverride(gatewayType: string, field: GatewayFieldKey): GatewayFieldOverride | undefined {
  const profile = getGatewayProfile(gatewayType);
  return profile.fieldOverrides[field];
}

export function getSuggestedDefaults(gatewayType: string): Partial<Record<GatewayFieldKey, boolean | string | number>> {
  const profile = getGatewayProfile(gatewayType);
  return profile.suggestedDefaults;
}

export function getConnectionFields(gatewayType: string) {
  const profile = getGatewayProfile(gatewayType);
  return profile.connectionFields;
}

export const TERMINAL_CONNECTION_TYPES = [
  { value: "tcp", label: "TCP/IP (Network)" },
  { value: "usb", label: "USB" },
  { value: "serial", label: "Serial (COM Port)" },
  { value: "bluetooth", label: "Bluetooth" },
  { value: "cloud_websocket", label: "Cloud WebSocket" },
] as const;
