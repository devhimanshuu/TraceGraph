// @ts-nocheck
<?php

namespace App\Payment;

use App\Utils\Logger;
use App\Gateway\PaymentGateway;

interface PaymentProcessor {
    public function processPayment(float $amount, string $currency): bool;
}

class PaymentService implements PaymentProcessor {
    private Logger $logger;
    private string $apiKey;

    public function __construct(string $apiKey, int $timeout = 30) {
        $this->apiKey = $apiKey;
        $this->logger = new Logger('PaymentService');
    }

    public function processPayment(float $amount, string $currency): bool {
        $this->logger->info("Processing {$amount} {$currency}");
        $gateway = new PaymentGateway($this->apiKey);
        return $gateway->charge($amount, $currency);
    }

    public function refund(string $transactionId): void {
        $this->logger->info("Refunding {$transactionId}");
    }
}

class PremiumPaymentService extends PaymentService {
    public function applyDiscount(float $amount, float $discount): float {
        return $amount * (1 - $discount);
    }
}

function calculateTax(float $amount, float $rate): float {
    return $amount * $rate;
}
