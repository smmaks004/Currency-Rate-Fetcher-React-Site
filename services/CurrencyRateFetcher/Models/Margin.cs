using System;
using System.Collections.Generic;

namespace CurrencyRateFetcher.Models;

public class Margin
{
    public int Id { get; set; }
    public decimal MarginValue { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }

    public ICollection<CurrencyRate> CurrencyRates { get; set; } = new List<CurrencyRate>();
}
