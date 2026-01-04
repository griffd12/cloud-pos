import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, X, AlertCircle } from "lucide-react";
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

const cardStyle = {
  style: {
    base: {
      fontSize: "16px",
      color: "#1a1a1a",
      fontFamily: "system-ui, -apple-system, sans-serif",
      "::placeholder": {
        color: "#6b7280",
      },
    },
    invalid: {
      color: "#dc2626",
    },
  },
};

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

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
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

      const { error, paymentIntent } = await stripe.confirmCardPayment(
        intentData.clientSecret,
        {
          payment_method: {
            card: cardElement,
          },
        }
      );

      if (error) {
        setErrorMessage(error.message || "Payment failed");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        onSuccess({
          paymentIntentId: paymentIntent.id,
          cardBrand: "card",
          cardLast4: "****",
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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="bg-primary text-primary-foreground rounded-lg px-4 py-2 shrink-0">
          <p className="text-2xl font-bold tabular-nums" data-testid="text-stripe-amount">
            ${amount.toFixed(2)}
          </p>
        </div>

        <div className="flex-1 min-w-[280px] bg-white border rounded-lg p-3">
          <CardElement options={cardStyle} />
        </div>

        <div className="flex gap-2 shrink-0">
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
                Pay ${amount.toFixed(2)}
              </>
            )}
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive" data-testid="text-stripe-error">
            {errorMessage}
          </p>
        </div>
      )}
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

  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm {...props} />
    </Elements>
  );
}
