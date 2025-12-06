using System;
using System.Xml.Linq;
using Serilog;
using System.Runtime.CompilerServices;
using CurrencyRateFetcher;
using CurrencyRateFetcher.Models;
using System.Globalization;
using static CurrencyRateFetcher.SettingsHelper;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;

public static class LoggerExtensions
{
    public static ILogger Here(this ILogger logger,
        [CallerMemberName] string memberName = "",
        [CallerFilePath] string sourceFilePath = "",
        [CallerLineNumber] int sourceLineNumber = 0)
    {
        return logger
            .ForContext("MemberName", memberName)
            .ForContext("FilePath", sourceFilePath)
            .ForContext("LineNumber", sourceLineNumber);
    }
}

class Program
{
    static async Task Main(string[] args)
    {
        // Configure logger
        Log.Logger = new LoggerConfiguration()
            .WriteTo.File(
                path: "logs/log-.txt",
                rollingInterval: RollingInterval.Day,
                outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss} {Level:u3}] {Message}{NewLine}{Exception}"
            )
            .CreateLogger();

        Log.Information("Program start");

        try
        {
            // Load configuration
            var databaseConfig = SettingsHelper.SettingsLoading();

            using var client = new HttpClient();
            using var context = new MyDbContext(databaseConfig);

            DateOnly today = DateOnly.FromDateTime(DateTime.Now);

            // Find the most recent date currently stored in the DB
            var lastRate = context.CurrencyRates
                .OrderByDescending(cr => cr.Date)
                .FirstOrDefault();

            string apiUrl = "";
            bool isRangeRequest = false;

            if (lastRate == null)
            {
                DateOnly defaultStart = new DateOnly(2024, 1, 1);
                Log.Information("Database is empty. Fetching range from default date.");

                apiUrl = $"https://api.frankfurter.dev/v1/{defaultStart:yyyy-MM-dd}..{today:yyyy-MM-dd}?base=EUR";
                isRangeRequest = true;
            }
            else
            {
                DateOnly lastDbDate = DateOnly.FromDateTime(lastRate.Date);
                Log.Information($"Last date in DB: {lastDbDate}. Today: {today}");

                    if (lastDbDate >= today)
                {
                    Log.Information("Database is up to date (LastDate >= Today). Nothing to do.");
                    return;
                }
                else if (lastDbDate == today.AddDays(-1))
                {
                    Log.Information("Gap is exactly 1 day. Using 'latest' endpoint.");

                    apiUrl = "https://api.frankfurter.dev/v1/latest?base=EUR";
                    isRangeRequest = false;
                }
                else
                {
                    DateOnly startDate = lastDbDate.AddDays(1);
                    Log.Information($"Gap is > 1 day. Fetching range: {startDate} .. {today}");

                    apiUrl = $"https://api.frankfurter.dev/v1/{startDate:yyyy-MM-dd}..{today:yyyy-MM-dd}?base=EUR";
                    isRangeRequest = true;
                }
            }

            // ============================================================
            // Request and response processing
            // ============================================================

            HttpResponseMessage response;
            try
            {
                response = await client.GetAsync(apiUrl);
                response.EnsureSuccessStatusCode();
            }
            catch (Exception ex)
            {
                Log.Error(ex, $"Failed to fetch data from Frankfurter API. URL: {apiUrl}");
                return;
            }

            var responseBody = await response.Content.ReadAsStringAsync();

            if (string.IsNullOrWhiteSpace(responseBody))
            {
                Log.Warning("Received empty response body.");
                return;
            }

            if (isRangeRequest)
            {
                // Treat response as a range (daily rates for multiple dates)
                var frankfurterRangeData = JsonSerializer.Deserialize<FrankfurterRangeResponse>(responseBody);

                if (frankfurterRangeData?.Rates == null)
                {
                    Log.Warning("Empty or invalid Frankfurter API range response");
                    return;
                }

                foreach (var dateRates in frankfurterRangeData.Rates)
                {
                    if (!DateOnly.TryParse(dateRates.Key, out var rateDate))
                    {
                        Log.Warning($"Invalid date format in range key: {dateRates.Key}");
                        continue;
                    }
                    await SaveRatesForDate(context, rateDate, dateRates.Value);
                }
            }
            else
            {
                // Treat response as latest (single-date) payload
                var frankfurterData = JsonSerializer.Deserialize<FrankfurterResponse>(responseBody);

                if (frankfurterData?.Rates == null)
                {
                    Log.Warning("Empty or invalid Frankfurter API response (Latest)");
                    return;
                }

                if (!DateOnly.TryParse(frankfurterData.Date, out var rateDate))
                {
                    Log.Warning($"Invalid date format in response: {frankfurterData.Date}");
                    return;
                }

                // FIXED: duplicate check for 'latest' using proper DateOnly comparison
                if (lastRate != null)
                {
                    DateOnly lastRateDateOnly = DateOnly.FromDateTime(lastRate.Date);

                    if (rateDate <= lastRateDateOnly)
                    {
                        Log.Information($"API 'latest' returned date {rateDate}, but we already have {lastRateDateOnly}. Skipping save.");
                        return;
                    }
                }

                await SaveRatesForDate(context, rateDate, frankfurterData.Rates);
            }

            Log.Information("Program completed successfully");
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "Application terminated unexpectedly");
        }
        finally
        {
            Log.CloseAndFlush();
        }
    }

    // Helper: save rates for a specific date
    static async Task SaveRatesForDate(MyDbContext context, DateOnly rateDate, Dictionary<string, decimal> rates)
    {
        Log.Information($"Processing rates for {rateDate}...");

        DateTime rateDateTime = rateDate.ToDateTime(TimeOnly.MinValue);

        // Find margin id once for the entire date (if applicable)
        int? marginId = context.FindMarginIdForDate(rateDateTime);
        if (marginId.HasValue)
            Console.WriteLine($"For date {rateDate} selected MarginId: {marginId}");

        foreach (var rate in rates)
        {
            // Ensure the currency exists (create if missing)
            var toCurrency = context.Currencies.FirstOrDefault(c => c.CurrencyCode == rate.Key);

            if (toCurrency == null)
            {
                toCurrency = new Currency { CurrencyCode = rate.Key };
                context.Currencies.Add(toCurrency);
                await context.SaveChangesAsync();
            }

            // Duplicate check (defensive)
            bool exists = context.CurrencyRates.Any(cr =>
                cr.Date == rateDateTime &&
                cr.ToCurrencyId == toCurrency.Id);

            if (exists) continue;

            // Create a new currency rate record
                var newRate = new CurrencyRate
            {
                Date = rateDateTime,
                ToCurrencyId = toCurrency.Id,
                ExchangeRate = rate.Value,
                MarginId = marginId
            };

            context.CurrencyRates.Add(newRate);
        }

        await context.SaveChangesAsync();
        Log.Information($"Saved {rates.Count} rates for {rateDate}");
    }
}

// Models
public class FrankfurterResponse
{
    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("base")]
    public string Base { get; set; } = string.Empty;

    [JsonPropertyName("date")]
    public string Date { get; set; } = string.Empty;

    [JsonPropertyName("rates")]
    public Dictionary<string, decimal> Rates { get; set; } = new();
}

public class FrankfurterRangeResponse
{
    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("base")]
    public string Base { get; set; } = string.Empty;

    [JsonPropertyName("start_date")]
    public string StartDate { get; set; } = string.Empty;

    [JsonPropertyName("end_date")]
    public string EndDate { get; set; } = string.Empty;

    [JsonPropertyName("rates")]
    public Dictionary<string, Dictionary<string, decimal>> Rates { get; set; } = new();
}