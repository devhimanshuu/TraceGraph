// @ts-nocheck
package com.example.payment;

import java.util.logging.Logger;

public interface PaymentProcessor {
    boolean processPayment(double amount, String currency);
}

public class PaymentService implements PaymentProcessor {
    private static final Logger logger = Logger.getLogger(PaymentService.class.getName());
    private final String apiKey;
    private final int timeout;

    public PaymentService(String apiKey, int timeout) {
        this.apiKey = apiKey;
        this.timeout = timeout;
    }

    @Override
    public boolean processPayment(double amount, String currency) {
        logger.info("Processing " + amount + " " + currency);
        PaymentGateway gateway = new PaymentGateway(apiKey);
        return gateway.charge(amount, currency);
    }

    public void refund(String transactionId) {
        logger.info("Refunding " + transactionId);
    }
}

class PremiumPaymentService extends PaymentService {
    public PremiumPaymentService(String apiKey) {
        super(apiKey, 60);
    }

    public double applyDiscount(double amount, double discount) {
        return amount * (1 - discount);
    }
}
