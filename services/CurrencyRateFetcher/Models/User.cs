using System;
using System.Collections.Generic;

namespace CurrencyRateFetcher.Models;

public partial class User
{
    public int Id { get; set; }
    public string Email { get; set; } = null!;
    public string PasswordHash { get; set; } = null!;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string Role { get; set; } = "user";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime? LastLogin { get; set; }

    public virtual ICollection<MarginHistory> MarginHistories { get; set; } = new List<MarginHistory>();
}
