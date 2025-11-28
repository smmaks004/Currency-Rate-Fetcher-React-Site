using Microsoft.EntityFrameworkCore;
using static CurrencyRateFetcher.SettingsHelper;

namespace CurrencyRateFetcher.Models;

public partial class MyDbContext : DbContext
{
    private readonly DatabaseConfig _databaseConfig;

    public MyDbContext(DatabaseConfig databaseConfig)
    {
        _databaseConfig = databaseConfig;
    }

    public virtual DbSet<User> Users { get; set; }
    public virtual DbSet<Currency> Currencies { get; set; }
    public virtual DbSet<CurrencyRate> CurrencyRates { get; set; }
    public virtual DbSet<Margin> Margins { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        var connectionString = $"" +
            $"Server={_databaseConfig.dbAddress};" +
            $"Database={_databaseConfig.dbName};" +
            $"Port={_databaseConfig.dbPort};" +
            $"User={_databaseConfig.dbUser};" +
            $"Password={_databaseConfig.dbPassword};";

        optionsBuilder.UseMySQL(connectionString);
    }
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Currency>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.CurrencyCode).IsUnique();
        });

        modelBuilder.Entity<CurrencyRate>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.Date, e.ToCurrencyId }).IsUnique();

            entity.HasOne(e => e.ToCurrency)
                .WithMany(c => c.CurrencyRates)
                .HasForeignKey(e => e.ToCurrencyId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Margin)
                .WithMany(m => m.CurrencyRates)
                .HasForeignKey(e => e.MarginId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Configuration for Margin, added connection to User
        modelBuilder.Entity<Margin>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.HasOne(e => e.User)
                .WithMany(u => u.Margins)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);


    public int? FindMarginIdForDate(DateTime rateDate)
    {
        var margin = Margins
            .Where(m => m.StartDate <= rateDate && (m.EndDate == null || rateDate <= m.EndDate))
            .OrderByDescending(m => m.StartDate)
            .FirstOrDefault();

        return margin?.Id;
    }
    
    
}
