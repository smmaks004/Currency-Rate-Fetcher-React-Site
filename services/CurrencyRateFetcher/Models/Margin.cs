using System;
using System.Collections.Generic;

namespace CurrencyRateFetcher.Models;

public class Margin
{
    public int Id { get; set; }
    public decimal MarginValue { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }

    public int UserId { get; set; }
    public virtual User User { get; set; } = null!;

    public ICollection<CurrencyRate> CurrencyRates { get; set; } = new List<CurrencyRate>();
}
