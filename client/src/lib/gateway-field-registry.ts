export type GatewayFieldKey =
  | "credentialKeyPrefix" | "merchantId" | "terminalId" | "siteId" | "deviceId" | "licenseId"
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

const heartlandProfile: GatewayProfile = {
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId", "terminalId", "siteId", "deviceId", "licenseId"],
    UNIVERSAL_TRANSACTION_FIELDS,
    ["enableDebit", "enableEbt", "enableHealthcare"],
    CARD_PRESENT_ENTRY,
    UNIVERSAL_FEATURES,
    ["enableStoreAndForward", "enableSurcharge", "enableIncrementalAuth", "enableCashback",
     "safFloorLimit", "safMaxTransactions"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "merchantId", label: "Merchant ID (MID)", description: "Heartland-assigned merchant identifier", placeholder: "Heartland MID" },
    { field: "terminalId", label: "Terminal ID (TID)", description: "Heartland terminal identifier", placeholder: "Terminal ID" },
    { field: "siteId", label: "Site ID", description: "Heartland site identifier for this location", placeholder: "Site ID" },
    { field: "deviceId", label: "Device ID", description: "Heartland device identifier for this workstation", placeholder: "Device ID" },
    { field: "licenseId", label: "License ID", description: "Heartland license key for API access", placeholder: "License ID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., HEARTLAND_MAIN)", placeholder: "HEARTLAND_MAIN" },
  ],
  fieldOverrides: {},
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enableAuthCapture: true,
    enableEmv: true,
    enableMsr: true,
    enableContactless: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptShowAid: true,
    receiptShowAppLabel: true,
    receiptShowEntryMethod: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
  },
};

const elavonConvergeProfile: GatewayProfile = {
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId", "terminalId"],
    UNIVERSAL_TRANSACTION_FIELDS,
    ["enableDebit"],
    CARD_PRESENT_ENTRY,
    UNIVERSAL_FEATURES,
    ["enableSurcharge", "enableIncrementalAuth"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "merchantId", label: "Converge Merchant ID", description: "Elavon Converge merchant account identifier", placeholder: "Converge MID" },
    { field: "terminalId", label: "Converge Terminal ID", description: "Converge terminal identifier for this device", placeholder: "Converge TID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., ELAVON_CONVERGE)", placeholder: "ELAVON_CONVERGE" },
  ],
  fieldOverrides: {
    enableDebit: { label: "Debit", description: "Debit card transactions via Converge" },
  },
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enableEmv: true,
    enableMsr: true,
    enableContactless: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
  },
};

const elavonFuseboxProfile: GatewayProfile = {
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId", "terminalId", "deviceId"],
    UNIVERSAL_TRANSACTION_FIELDS,
    ["enableDebit"],
    CARD_PRESENT_ENTRY,
    UNIVERSAL_FEATURES,
    ["enableSurcharge", "enableIncrementalAuth", "enableStoreAndForward", "safFloorLimit", "safMaxTransactions"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "merchantId", label: "Fusebox Merchant ID", description: "Elavon Fusebox merchant identifier", placeholder: "Fusebox MID" },
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
    enableEmv: true,
    enableMsr: true,
    enableContactless: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
  },
};

const stripeProfile: GatewayProfile = {
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
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId", "terminalId", "deviceId"],
    UNIVERSAL_TRANSACTION_FIELDS,
    ["enableDebit"],
    CARD_PRESENT_ENTRY,
    UNIVERSAL_FEATURES,
    ["enableSurcharge", "enableCashback", "enableStoreAndForward", "safFloorLimit", "safMaxTransactions"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "merchantId", label: "North Merchant ID", description: "North/TSYS merchant identifier", placeholder: "North MID" },
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
    enableEmv: true,
    enableMsr: true,
    enableContactless: true,
    enablePartialApproval: true,
    enableDebit: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
  },
};

const shift4Profile: GatewayProfile = {
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId", "terminalId", "deviceId"],
    UNIVERSAL_TRANSACTION_FIELDS,
    ["enableDebit"],
    CARD_PRESENT_ENTRY,
    UNIVERSAL_FEATURES,
    ["enableSurcharge", "enableCashback", "enableStoreAndForward", "safFloorLimit", "safMaxTransactions"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
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
    enableEmv: true,
    enableMsr: true,
    enableContactless: true,
    enablePartialApproval: true,
    enableDebit: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
  },
};

const freedompayProfile: GatewayProfile = {
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId", "terminalId", "deviceId"],
    UNIVERSAL_TRANSACTION_FIELDS,
    ["enableDebit"],
    CARD_PRESENT_ENTRY,
    UNIVERSAL_FEATURES,
    ["enableSurcharge", "enableCashback"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
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
    enableEmv: true,
    enableMsr: true,
    enableContactless: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
  },
};

const eigenProfile: GatewayProfile = {
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId", "terminalId"],
    UNIVERSAL_TRANSACTION_FIELDS,
    ["enableDebit"],
    CARD_PRESENT_ENTRY,
    UNIVERSAL_FEATURES,
    ["enableSurcharge"],
    UNIVERSAL_BATCH,
    UNIVERSAL_RECEIPT,
    EMV_RECEIPT_FIELDS,
    UNIVERSAL_DEBUG,
  ),
  connectionFields: [
    { field: "merchantId", label: "Eigen Merchant ID", description: "Eigen-assigned merchant identifier", placeholder: "Eigen MID" },
    { field: "terminalId", label: "Eigen Terminal ID", description: "Eigen terminal identifier", placeholder: "Eigen TID" },
    { field: "credentialKeyPrefix", label: "Credential Key Prefix", description: "Secret name prefix (e.g., EIGEN_MAIN)", placeholder: "EIGEN_MAIN" },
  ],
  fieldOverrides: {},
  suggestedDefaults: {
    enableSale: true,
    enableVoid: true,
    enableRefund: true,
    enableEmv: true,
    enableMsr: true,
    enableContactless: true,
    enablePartialApproval: true,
    enableManualBatchClose: true,
    receiptShowEmvFields: true,
    receiptPrintMerchantCopy: true,
    receiptPrintCustomerCopy: true,
  },
};

const fallbackProfile: GatewayProfile = {
  supportedFields: fieldSet(
    ["credentialKeyPrefix", "merchantId", "terminalId", "siteId", "deviceId", "licenseId"],
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
