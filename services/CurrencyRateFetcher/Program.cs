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

public static class LoggerExtensions // Extension method for Serilog
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
        // Logging configuration
        Log.Logger = new LoggerConfiguration()
            .WriteTo.File(
                path: "logs/log-.txt",
                rollingInterval: RollingInterval.Day,
                outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss} {Level:u3}] {Message}{NewLine}{Exception}"
            )
            .CreateLogger();

        Log.Information("Program start");

        // Load DB config from SettingsHelper
        var databaseConfig = SettingsHelper.SettingsLoading();


        // Frankfurter API: get all rates for today (base EUR)
        //string apiUrl = $"https://api.frankfurter.dev/{today:yyyy-MM-dd}";





        using var client = new HttpClient();
        using var context = new MyDbContext(databaseConfig);


        // Save to DB

        //string apiUrl = $"https://api.frankfurter.dev/v1/latest?base=EUR";
        string apiUrl = $"https://api.frankfurter.dev/v1/2024-01-02..2025-10-21?base=EUR";


        HttpResponseMessage response;
        try
        {
            response = await client.GetAsync(apiUrl);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to fetch data from Frankfurter API");
            return;
        }

        var responseBody = await response.Content.ReadAsStringAsync();

        using var doc = JsonDocument.Parse(responseBody);
        var root = doc.RootElement;

        // Detect if it's a range response (rates is a dictionary of dates)
        if (root.TryGetProperty("rates", out var ratesElement) && ratesElement.ValueKind == JsonValueKind.Object)
        {
            // If "date" property exists, it's a single date response
            if (root.TryGetProperty("date", out var dateElement))
            {
                // Single date response
                var frankfurterData = JsonSerializer.Deserialize<FrankfurterResponse>(responseBody);

                if (frankfurterData?.Rates == null)
                {
                    Log.Warning("Empty or invalid Frankfurter API response");
                    return;
                }

                if (!DateOnly.TryParse(frankfurterData.Date, out var rateDate))
                {
                    Log.Warning($"Invalid date format: {frankfurterData.Date}");
                    return;
                }

                await SaveRatesForDate(context, rateDate, frankfurterData.Rates);
            }
            else
            {
                // Range response
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
                        Log.Warning($"Invalid date format: {dateRates.Key}");
                        continue;
                    }

                    await SaveRatesForDate(context, rateDate, dateRates.Value);
                }
            }
        }
        else
        {
            Log.Warning("Frankfurter API response format not recognized.");
        }

        Log.Information("Program completed successfully");
        Log.CloseAndFlush();
    }

    // Helper method to save rates for a specific date
    static async Task SaveRatesForDate(MyDbContext context, DateOnly rateDate, Dictionary<string, decimal> rates)
    {
        foreach (var rate in rates)
        {
            var toCurrency = context.Currencies.FirstOrDefault(c => c.CurrencyCode == rate.Key)
                ?? new Currency { CurrencyCode = rate.Key };

            if (toCurrency.Id == 0)
            {
                context.Currencies.Add(toCurrency);
                context.SaveChanges();
            }

            bool exists = context.CurrencyRates.Any(cr =>
                cr.Date == rateDate &&
                cr.ToCurrencyId == toCurrency.Id);

            if (exists)
            {
                Log.Information($"Rate for EUR → {rate.Key} on {rateDate} already exists. Skipping.");
                continue;
            }

            // Найти подходящую маржу для этой даты
            int? marginId = context.FindMarginIdForDate(rateDate.ToDateTime(TimeOnly.MinValue));
            Console.WriteLine($"Для даты {rateDate} выбрана MarginId: {marginId}");

            var newRate = new CurrencyRate
            {
                Date = rateDate,
                ToCurrencyId = toCurrency.Id,
                ExchangeRate = rate.Value,
                MarginId = marginId
            };

            context.CurrencyRates.Add(newRate);
            context.SaveChanges();

            Log.Information($"Saved rate: EUR → {rate.Key} = {rate.Value} on {rateDate}");
        }
    }
}

// For single date response
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

// For range response
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