/**
 * Heartland (Global Payments) Payment Gateway Adapter
 * 
 * Implements the PaymentGatewayAdapter interface for Heartland's Portico Gateway.
 * Uses direct SOAP API calls to the Portico gateway.
 */

import type {
  PaymentGatewayAdapter,
  GatewayCredentials,
  GatewaySettings,
  AuthorizationRequest,
  AuthorizationResponse,
  CaptureRequest,
  CaptureResponse,
  VoidRequest,
  VoidResponse,
  RefundRequest,
  RefundResponse,
  TipAdjustRequest,
  TipAdjustResponse,
  TransactionStatusRequest,
  TransactionStatusResponse,
} from '../types';
import { registerPaymentAdapter } from '../registry';

const SANDBOX_URL = 'https://cert.api2.heartlandportico.com/Hps.Exchange.PosGateway/PosGatewayService.asmx';
const PRODUCTION_URL = 'https://api2.heartlandportico.com/Hps.Exchange.PosGateway/PosGatewayService.asmx';

class HeartlandPaymentAdapter implements PaymentGatewayAdapter {
  readonly gatewayType = 'heartland';
  private secretApiKey: string;
  private developerId: string;
  private versionNumber: string;
  private serviceUrl: string;
  private environment: 'sandbox' | 'production';

  constructor(
    credentials: GatewayCredentials,
    _settings: GatewaySettings,
    environment: 'sandbox' | 'production'
  ) {
    const secretApiKey = credentials.SECRET_API_KEY;
    const developerId = credentials.DEVELOPER_ID;
    const versionNumber = credentials.VERSION_NUMBER;
    
    if (!secretApiKey) {
      throw new Error('Heartland SECRET_API_KEY is required');
    }
    
    this.secretApiKey = secretApiKey;
    this.developerId = developerId || '000000';
    this.versionNumber = versionNumber || '0000';
    this.environment = environment;
    this.serviceUrl = environment === 'production' ? PRODUCTION_URL : SANDBOX_URL;
    
    console.log('[Heartland] Initialized with DeveloperID length:', this.developerId.length, 'VersionNbr length:', this.versionNumber.length);
  }

  private buildSoapEnvelope(transactionXml: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <PosRequest xmlns="http://Hps.Exchange.PosGateway">
      <Ver1.0>
        <Header>
          <SecretAPIKey>${this.secretApiKey}</SecretAPIKey>
          <DeveloperID>${this.developerId}</DeveloperID>
          <VersionNbr>${this.versionNumber}</VersionNbr>
        </Header>
        <Transaction>
          ${transactionXml}
        </Transaction>
      </Ver1.0>
    </PosRequest>
  </soap:Body>
</soap:Envelope>`;
  }

  private async sendRequest(soapEnvelope: string): Promise<string> {
    const response = await fetch(this.serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"http://Hps.Exchange.PosGateway/PosGatewayService/DoTransaction"',
      },
      body: soapEnvelope,
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('Heartland SOAP Error Response:', responseText);
      throw new Error(`Heartland API error: ${response.status} ${response.statusText}`);
    }

    return responseText;
  }

  private extractValue(xml: string, tagName: string): string | undefined {
    const patterns = [
      new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i'),
      new RegExp(`<[^:]+:${tagName}>([^<]*)</[^:]+:${tagName}>`, 'i'),
      new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i'),
    ];
    
    for (const pattern of patterns) {
      const match = xml.match(pattern);
      if (match) return match[1];
    }
    return undefined;
  }

  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    try {
      const transactionXml = `
        <CreditAuth>
          <Block1>
            <Amt>${(request.amount / 100).toFixed(2)}</Amt>
            <AllowDup>Y</AllowDup>
            <AllowPartialAuth>N</AllowPartialAuth>
          </Block1>
        </CreditAuth>`;

      const envelope = this.buildSoapEnvelope(transactionXml);
      const responseXml = await this.sendRequest(envelope);

      const gatewayRspCode = this.extractValue(responseXml, 'GatewayRspCode');
      const gatewayRspMsg = this.extractValue(responseXml, 'GatewayRspMsg');
      const rspCode = this.extractValue(responseXml, 'RspCode');
      const rspText = this.extractValue(responseXml, 'RspText');
      const gatewayTxnId = this.extractValue(responseXml, 'GatewayTxnId');
      const authCode = this.extractValue(responseXml, 'AuthCode');

      const success = gatewayRspCode === '0' && (rspCode === '00' || rspCode === '0' || !rspCode);

      return {
        success,
        transactionId: gatewayTxnId || '',
        authCode: authCode,
        referenceNumber: gatewayTxnId,
        responseCode: rspCode || gatewayRspCode,
        responseMessage: rspText || gatewayRspMsg,
        errorCode: success ? undefined : (rspCode || gatewayRspCode),
        errorMessage: success ? undefined : (rspText || gatewayRspMsg),
        declined: rspCode === '05' || rspCode === '51',
        declineReason: success ? undefined : rspText,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: '',
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Authorization failed',
      };
    }
  }

  async capture(request: CaptureRequest): Promise<CaptureResponse> {
    try {
      const transactionXml = `
        <CreditAddToBatch>
          <GatewayTxnId>${request.transactionId}</GatewayTxnId>
          <Amt>${(request.amount / 100).toFixed(2)}</Amt>
        </CreditAddToBatch>`;

      const envelope = this.buildSoapEnvelope(transactionXml);
      const responseXml = await this.sendRequest(envelope);

      const gatewayRspCode = this.extractValue(responseXml, 'GatewayRspCode');
      const gatewayRspMsg = this.extractValue(responseXml, 'GatewayRspMsg');
      const success = gatewayRspCode === '0';

      return {
        success,
        transactionId: request.transactionId,
        capturedAmount: success ? request.amount : 0,
        responseCode: gatewayRspCode,
        responseMessage: gatewayRspMsg,
        errorCode: success ? undefined : gatewayRspCode,
        errorMessage: success ? undefined : gatewayRspMsg,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        capturedAmount: 0,
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Capture failed',
      };
    }
  }

  async void(request: VoidRequest): Promise<VoidResponse> {
    try {
      const transactionXml = `
        <CreditVoid>
          <GatewayTxnId>${request.transactionId}</GatewayTxnId>
        </CreditVoid>`;

      const envelope = this.buildSoapEnvelope(transactionXml);
      const responseXml = await this.sendRequest(envelope);

      const gatewayRspCode = this.extractValue(responseXml, 'GatewayRspCode');
      const gatewayRspMsg = this.extractValue(responseXml, 'GatewayRspMsg');
      const success = gatewayRspCode === '0';

      return {
        success,
        transactionId: request.transactionId,
        responseCode: gatewayRspCode,
        responseMessage: gatewayRspMsg,
        errorCode: success ? undefined : gatewayRspCode,
        errorMessage: success ? undefined : gatewayRspMsg,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Void failed',
      };
    }
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    try {
      const transactionXml = `
        <CreditReturn>
          <Block1>
            <Amt>${(request.amount / 100).toFixed(2)}</Amt>
            <GatewayTxnId>${request.transactionId}</GatewayTxnId>
          </Block1>
        </CreditReturn>`;

      const envelope = this.buildSoapEnvelope(transactionXml);
      const responseXml = await this.sendRequest(envelope);

      const gatewayRspCode = this.extractValue(responseXml, 'GatewayRspCode');
      const gatewayRspMsg = this.extractValue(responseXml, 'GatewayRspMsg');
      const gatewayTxnId = this.extractValue(responseXml, 'GatewayTxnId');
      const success = gatewayRspCode === '0';

      return {
        success,
        transactionId: gatewayTxnId || request.transactionId,
        refundedAmount: success ? request.amount : 0,
        responseCode: gatewayRspCode,
        responseMessage: gatewayRspMsg,
        errorCode: success ? undefined : gatewayRspCode,
        errorMessage: success ? undefined : gatewayRspMsg,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        refundedAmount: 0,
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }

  async tipAdjust(request: TipAdjustRequest): Promise<TipAdjustResponse> {
    try {
      const transactionXml = `
        <CreditTipEdit>
          <GatewayTxnId>${request.transactionId}</GatewayTxnId>
          <GratuityAmtInfo>${(request.tipAmount / 100).toFixed(2)}</GratuityAmtInfo>
        </CreditTipEdit>`;

      const envelope = this.buildSoapEnvelope(transactionXml);
      const responseXml = await this.sendRequest(envelope);

      const gatewayRspCode = this.extractValue(responseXml, 'GatewayRspCode');
      const gatewayRspMsg = this.extractValue(responseXml, 'GatewayRspMsg');
      const success = gatewayRspCode === '0';

      return {
        success,
        transactionId: request.transactionId,
        newTotalAmount: 0,
        tipAmount: request.tipAmount,
        responseCode: gatewayRspCode,
        responseMessage: gatewayRspMsg,
        errorCode: success ? undefined : gatewayRspCode,
        errorMessage: success ? undefined : gatewayRspMsg,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        newTotalAmount: 0,
        tipAmount: 0,
        errorCode: 'CONNECTION_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Tip adjust failed',
      };
    }
  }

  async getTransactionStatus(request: TransactionStatusRequest): Promise<TransactionStatusResponse> {
    try {
      const transactionXml = `
        <ReportTxnDetail>
          <TxnId>${request.transactionId}</TxnId>
        </ReportTxnDetail>`;

      const envelope = this.buildSoapEnvelope(transactionXml);
      const responseXml = await this.sendRequest(envelope);

      const gatewayRspCode = this.extractValue(responseXml, 'GatewayRspCode');
      const amt = this.extractValue(responseXml, 'Amt');
      const success = gatewayRspCode === '0';

      return {
        success,
        transactionId: request.transactionId,
        status: success ? 'authorized' : 'unknown',
        amount: amt ? Math.round(parseFloat(amt) * 100) : 0,
      };
    } catch (error) {
      return {
        success: false,
        transactionId: request.transactionId,
        status: 'unknown',
        amount: 0,
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const transactionXml = `
        <CreditAccountVerify>
          <Block1>
            <CardData>
              <ManualEntry>
                <CardNbr>4111111111111111</CardNbr>
                <ExpMonth>12</ExpMonth>
                <ExpYear>2025</ExpYear>
              </ManualEntry>
            </CardData>
          </Block1>
        </CreditAccountVerify>`;

      const envelope = this.buildSoapEnvelope(transactionXml);
      const responseXml = await this.sendRequest(envelope);

      const gatewayRspCode = this.extractValue(responseXml, 'GatewayRspCode');
      const gatewayRspMsg = this.extractValue(responseXml, 'GatewayRspMsg');
      const rspCode = this.extractValue(responseXml, 'RspCode');
      const rspText = this.extractValue(responseXml, 'RspText');
      
      if (gatewayRspCode === '0') {
        const issuerResponse = rspCode === '85' || rspCode === '00' ? 'Approved' : (rspText || 'Success');
        return {
          success: true,
          message: `Heartland connection successful (${this.environment}). Issuer: ${issuerResponse}`,
        };
      }

      return {
        success: false,
        message: gatewayRspMsg || `Heartland connection test failed with code: ${gatewayRspCode}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }
}

function createHeartlandAdapter(
  credentials: GatewayCredentials,
  settings: GatewaySettings,
  environment: 'sandbox' | 'production'
): PaymentGatewayAdapter {
  return new HeartlandPaymentAdapter(credentials, settings, environment);
}

registerPaymentAdapter('heartland', createHeartlandAdapter);

export { HeartlandPaymentAdapter, createHeartlandAdapter };
