using CurrencyRateFetcher.Models;

public class Currency
{
    public int Id { get; set; }
    public string CurrencyCode { get; set; } = string.Empty;
    public ICollection<CurrencyRate> CurrencyRates { get; set; } = new List<CurrencyRate>();
}