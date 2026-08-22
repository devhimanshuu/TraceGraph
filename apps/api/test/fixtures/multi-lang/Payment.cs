// @ts-nocheck
using System;
using System.Threading.Tasks;

namespace App.Payment
{
    public interface IPaymentProcessor
    {
        Task<bool> ProcessPaymentAsync(double amount, string currency);
    }

    public class PaymentService : IPaymentProcessor
    {
        private readonly string _apiKey;
        private readonly int _timeout;

        public PaymentService(string apiKey, int timeout = 30)
        {
            _apiKey = apiKey;
            _timeout = timeout;
        }

        public virtual async Task<bool> ProcessPaymentAsync(double amount, string currency)
        {
            Console.WriteLine($"Processing {amount} {currency}");
            var gateway = new PaymentGateway(_apiKey);
            return await gateway.ChargeAsync(amount, currency);
        }

        public void Refund(string transactionId)
        {
            Console.WriteLine($"Refunding {transactionId}");
        }
    }

    public class PremiumPaymentService : PaymentService
    {
        public PremiumPaymentService(string apiKey)
            : base(apiKey, 60)
        {
        }

        public double ApplyDiscount(double amount, double discount)
        {
            return amount * (1 - discount);
        }
    }

    public static class TaxCalculator
    {
        public static double CalculateTax(double amount, double rate)
        {
            return amount * rate;
        }
    }
}
