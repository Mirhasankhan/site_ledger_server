import config from "@/config";
import { Injectable } from "@nestjs/common";
import Stripe from "stripe";

@Injectable()
export class StripeService {
    private stripe: Stripe;

    constructor() {
        const apiKey =
            config.stripe.secret_key || "sk_test_placeholder_key_not_configured";
        this.stripe = new Stripe(apiKey, {
            apiVersion: "2025-08-27.basil", // Use the latest API version
        });
    }

    private ensureConfigured() {
        if (!config.stripe.secret_key) {
            throw new Error(
                "Stripe secret key is not configured. Please add STRIPE_SECRET_KEY to your .env file.",
            );
        }
    }


    async createPaymentIntent({
        amount,
        currency,
        metadata,
    }: {
        amount: number;
        currency: string;
        metadata: Stripe.MetadataParam;
    }) {
        return await this.stripe.paymentIntents.create({
            amount: amount, // Amount in cents
            currency: currency,
            payment_method_types: ["card"],
            metadata,
        });
    }

    async createCheckoutSession({
        line_items,
        client,
        metadata,
    }: {
        line_items: Stripe.Checkout.SessionCreateParams.LineItem[];
        client: {
            id?: string;
            email?: string;
        };
        metadata: Stripe.MetadataParam;
    }) {
        return this.stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [...line_items],
            mode: "payment",
            allow_promotion_codes: true,
            success_url: config.url.payment_success,
            cancel_url: config.url.payment_success,
            client_reference_id: client.id,
            customer_email: client.email,
            metadata: { ...metadata },
            payment_intent_data: {
                metadata: { ...metadata },
            },
        });
    }

    async createConnectAccount(
        email: string,
        metadata?: Record<string, string>,
    ): Promise<Stripe.Account> {
        this.ensureConfigured();
        return await this.stripe.accounts.create({
            type: "express",
            email,
            capabilities: {
                transfers: { requested: true },
            },
            business_type: "individual",
            metadata,
        });
    }

    async createAccountLink(
        stripeAccountId: string,
        returnUrl: string,
        refreshUrl: string,
    ): Promise<string> {
        this.ensureConfigured();
        const link = await this.stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: "account_onboarding",
        });
        return link.url;
    }

    async getAccountStatus(stripeAccountId: string) {
        this.ensureConfigured();
        const account = await this.stripe.accounts.retrieve(stripeAccountId);
        return {
            id: account.id,
            detailsSubmitted: account.details_submitted ?? false,
            payoutsEnabled: account.payouts_enabled ?? false,
            chargesEnabled: account.charges_enabled ?? false,
        };
    }

    async transferMoneyToConnectedWorker(stripeAccountId: string, amount: number) {
        this.ensureConfigured();
        const transfer = await this.stripe.transfers.create({
            amount: Math.round(amount * 100),
            currency: "usd",
            destination: stripeAccountId,
        });


        return transfer;
    }


    async createCharge(data: Stripe.ChargeCreateParams) {
        return await this.stripe.charges.create(data);
    }

    async retrieveCharge(id: string) {
        return await this.stripe.charges.retrieve(id);
    }

    async constructEvent(
        payload: string | Buffer<ArrayBufferLike>,
        sig: string,
    ): Promise<Stripe.Event> {
        const webhookSecret = config.stripe.webhook_secret;

        // console.log(sig, webhookSecret);

        return this.stripe.webhooks.constructEvent(payload, sig, webhookSecret);
    }
}
