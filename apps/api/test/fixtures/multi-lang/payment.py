// @ts-nocheck
"""Payment processing module in Python."""
from .utils import Logger
from .gateway import PaymentGateway
from typing import Optional


class PaymentService:
    """Handles payment processing."""
    
    def __init__(self, api_key: str, timeout: int = 30):
        self.api_key = api_key
        self.timeout = timeout
        self.logger = Logger("PaymentService")
    
    def process_payment(self, amount: float, currency: str) -> bool:
        self.logger.info(f"Processing {amount} {currency}")
        gateway = PaymentGateway(self.api_key)
        return gateway.charge(amount, currency)
    
    def refund(self, transaction_id: str) -> None:
        self.logger.info(f"Refunding {transaction_id}")


def calculate_tax(amount: float, rate: float) -> float:
    return amount * rate


class PremiumPaymentService(PaymentService):
    """Premium tier with additional features."""
    
    def apply_discount(self, amount: float, discount: float) -> float:
        return amount * (1 - discount)
