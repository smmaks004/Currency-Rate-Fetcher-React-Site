using System;

namespace CurrencyRateFetcher.Models;

public partial class MarginHistory
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int? OldMarginId { get; set; }
    public int? NewMarginId { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.Now;
    public string? Comment { get; set; }

    public virtual User User { get; set; } = null!;
    public virtual Margin? OldMargin { get; set; }
    public virtual Margin? NewMargin { get; set; }
}
