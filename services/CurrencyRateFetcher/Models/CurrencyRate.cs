using System;

namespace CurrencyRateFetcher.Models;

public partial class CurrencyRate
{
    public int Id { get; set; }
    public DateOnly Date { get; set; }
    public int ToCurrencyId { get; set; }
    public decimal ExchangeRate { get; set; }
    public int? MarginId { get; set; }

    public virtual Currency ToCurrency { get; set; } = null!;
    public virtual Margin? Margin { get; set; }
}
