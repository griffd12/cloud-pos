import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, X, CheckCircle, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

interface StripeCardFormProps {
  amount: number;
  checkId: string;
  tenderId: string;
  employeeId?: string;
  workstationId?: string;
  propertyId?: string;
  onSuccess: (result: {
    paymentIntentId: string;
    cardBrand?: string;
    cardLast4?: string;
  }) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

function CheckoutForm({
  amount,
  checkId,
  tenderId,
  employeeId,
  workstationId,
  onSuccess,
  onCancel,
  onError,
}: Omit<StripeCardFormProps, "propertyId">) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // First validate the form
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setErrorMessage(submitError.message || "Please check your card details");
        setIsProcessing(false);
        return;
      }

      // Create PaymentIntent on the server
      const intentRes = await apiRequest("POST", "/api/stripe/create-payment-intent", {
        amount,
        checkId,
        tenderId,
        employeeId,
        workstationId,
      });

      const intentData = await intentRes.json();
      
      if (!intentData.clientSecret) {
        throw new Error(intentData.message || "Failed to create payment");
      }

      // Confirm the payment
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: intentData.clientSecret,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (error) {
        setErrorMessage(error.message || "Payment failed");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        // Get card details from the payment method
        let cardBrand: string | undefined;
        let cardLast4: string | undefined;
        
        if (paymentIntent.payment_method && typeof paymentIntent.payment_method === "string") {
          try {
            // We can't fetch payment method details from client, use metadata if available
            cardBrand = "card";
            cardLast4 = "****";
          } catch {
            // Ignore error, card details are optional
          }
        }

        onSuccess({
          paymentIntentId: paymentIntent.id,
          cardBrand,
          cardLast4,
        });
      } else {
        setErrorMessage("Payment was not completed");
        setIsProcessing(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment failed";
      setErrorMessage(message);
      onError(message);
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-center shrink-0">
          <p className="text-xs opacity-90">Charging</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="text-stripe-amount">
            ${amount.toFixed(2)}
          </p>
        </div>

        <div className="flex-1 flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            data-testid="button-stripe-cancel"
          >
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={!stripe || !elements || isProcessing}
            data-testid="button-stripe-pay"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                Pay Now
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-3">
        <PaymentElement
          options={{
            layout: {
              type: "accordion",
              defaultCollapsed: false,
              radios: false,
              spacedAccordionItems: false,
            },
          }}
        />
      </div>

      {errorMessage && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive" data-testid="text-stripe-error">
            {errorMessage}
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Secured by Stripe
      </p>
    </form>
  );
}

export function StripeCardForm(props: StripeCardFormProps) {
  if (!stripePromise) {
    return (
      <div className="p-4 text-center space-y-4">
        <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
        <div>
          <p className="font-medium text-destructive">Stripe Not Configured</p>
          <p className="text-sm text-muted-foreground mt-1">
            Please add VITE_STRIPE_PUBLISHABLE_KEY to enable card payments.
          </p>
        </div>
        <Button variant="outline" onClick={props.onCancel}>
          Go Back
        </Button>
      </div>
    );
  }

  const options = {
    mode: "payment" as const,
    amount: Math.round(props.amount * 100), // Amount in cents
    currency: "usd",
    paymentMethodTypes: ["card"], // Card only for POS - no Cash App, Klarna, Amazon Pay
    appearance: {
      theme: "stripe" as const,
      variables: {
        colorPrimary: "#0f172a",
        borderRadius: "8px",
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutForm {...props} />
    </Elements>
  );
}
