// @ts-nocheck
package payment

import (
	"fmt"
	"time"
)

type PaymentConfig struct {
	ApiKey  string
	Timeout time.Duration
}

type PaymentService struct {
	config PaymentConfig
}

func NewPaymentService(config PaymentConfig) *PaymentService {
	return &PaymentService{config: config}
}

func (s *PaymentService) ProcessPayment(amount float64, currency string) (bool, error) {
	fmt.Printf("Processing %f %s\n", amount, currency)
	return true, nil
}

func (s *PaymentService) Refund(transactionID string) error {
	fmt.Printf("Refunding %s\n", transactionID)
	return nil
}

func CalculateTax(amount float64, rate float64) float64 {
	return amount * rate
}

type PremiumPaymentService struct {
	PaymentService
}

func (p *PremiumPaymentService) ApplyDiscount(amount float64, discount float64) float64 {
	return amount * (1 - discount)
}
