// @ts-nocheck
pub struct PaymentConfig {
    pub api_key: String,
    pub timeout: u64,
}

pub trait PaymentProcessor {
    fn process_payment(&self, amount: f64, currency: &str) -> Result<bool, String>;
}

pub struct PaymentService {
    config: PaymentConfig,
}

impl PaymentService {
    pub fn new(config: PaymentConfig) -> Self {
        PaymentService { config }
    }

    pub fn process_payment(&self, amount: f64, currency: &str) -> Result<bool, String> {
        println!("Processing {} {}", amount, currency);
        Ok(true)
    }

    pub fn refund(&self, transaction_id: &str) {
        println!("Refunding {}", transaction_id);
    }
}

pub fn calculate_tax(amount: f64, rate: f64) -> f64 {
    amount * rate
}

pub struct PremiumPaymentService {
    inner: PaymentService,
}

impl PremiumPaymentService {
    pub fn apply_discount(&self, amount: f64, discount: f64) -> f64 {
        amount * (1.0 - discount)
    }
}
