using System;
using System.Xml.Linq;
using Serilog;
using System.Runtime.CompilerServices;
using CurrencyRateFetcher;
using CurrencyRateFetcher.Models;
using System.Globalization;
//using static CurrencyRateFetcher.SettingsHelper;
//using System.Text.Json;
//using System.Text.Json.Serialization;
//using Microsoft.Extensions.Configuration;
//using Microsoft.EntityFrameworkCore;
using System.Net.Http;
using static System.Runtime.InteropServices.JavaScript.JSType;

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
        // Configure Serilog for file logging
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
            // Load database configuration from settings
            var databaseConfig = SettingsHelper.SettingsLoading();

            using var client = new HttpClient();
            using var context = new MyDbContext(databaseConfig);

            DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow);

            // Get the most recent currency rate from the database
            var lastRate = context.CurrencyRates
                .OrderByDescending(cr => cr.Date)
                .FirstOrDefault();

            DateOnly lastDbDate = lastRate == null
                ? new DateOnly(2000, 1, 1)
                : DateOnly.FromDateTime(lastRate.Date);

            // If the database is already up to date, exit
            if (lastDbDate >= today)
            {
                Log.Information("Database is up to date. Nothing to do.");
                return;
            }

            DateOnly startDate = lastDbDate.AddDays(1);

            Log.Information($"Fetching ECB SDMX data from {startDate} to {today}");

            // ============================================================
            // FRANKFURTER API (LEFT FOR HISTORY, BUT NOT USED)
            // ============================================================
            /*
            string apiUrl = $"https://api.frankfurter.dev/v1/{startDate:yyyy-MM-dd}..{today:yyyy-MM-dd}?base=EUR";
            */


            // ============================================================
            // ECB SDMX DATA API
            // ============================================================

            // Build ECB SDMX API URL for the required date range
            string ecbUrl =
                $"https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A" +
                $"?startPeriod={startDate:yyyy-MM-dd}" +
                $"&endPeriod={today:yyyy-MM-dd}" +
                $"&format=xml";

            HttpResponseMessage response;
            try
            {
                // Fetch data from ECB SDMX API
                response = await client.GetAsync(ecbUrl);
                response.EnsureSuccessStatusCode();
            }
            catch (Exception ex)
            {
                Log.Error(ex, $"Failed to fetch data from ECB SDMX API. URL: {ecbUrl}");
                return;
            }

            string xml = await response.Content.ReadAsStringAsync();

            if (string.IsNullOrWhiteSpace(xml))
            {
                Log.Warning("ECB SDMX response is empty");
                return;
            }

            // Parse the XML response
            XDocument doc = XDocument.Parse(xml);

            XNamespace messageNs = "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message";
            XNamespace genericNs = "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic";

            var seriesNodes = doc
                .Descendants(genericNs + "Series");

            // Date -> (Currency -> Rate)
            var ratesByDate = new Dictionary<DateOnly, Dictionary<string, decimal>>();

            foreach (var series in seriesNodes)
            {
                // Extract currency code from the series node
                string currency = series
                    .Descendants(genericNs + "Value")
                    .First(v => v.Attribute("id")?.Value == "CURRENCY")
                    .Attribute("value")!.Value;

                var observations = series.Descendants(genericNs + "Obs");

                foreach (var obs in observations)
                {
                    // Extract date and rate value from each observation
                    string dateStr = obs
                        .Element(genericNs + "ObsDimension")?
                        .Attribute("value")?.Value ?? "";

                    string valueStr = obs
                        .Element(genericNs + "ObsValue")?
                        .Attribute("value")?.Value ?? "";

                    if (!DateOnly.TryParse(dateStr, out var date))
                        continue;

                    if (!decimal.TryParse(valueStr, NumberStyles.Any, CultureInfo.InvariantCulture, out var rate))
                        continue;

                    if (!ratesByDate.ContainsKey(date))
                        ratesByDate[date] = new Dictionary<string, decimal>();

                    ratesByDate[date][currency] = rate;
                }
            }

            // Save new rates to the database
            foreach (var day in ratesByDate.OrderBy(d => d.Key))
            {
                if (day.Key <= lastDbDate)
                    continue;

                await SaveRatesForDate(context, day.Key, day.Value);
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

    // Saves currency rates for a specific date to the database.
    static async Task SaveRatesForDate(MyDbContext context, DateOnly rateDate, Dictionary<string, decimal> rates)
    {
        Log.Information($"Processing rates for {rateDate}");

        DateTime rateDateTime = rateDate.ToDateTime(TimeOnly.MinValue);

        // Find the margin ID for the given date
        int? marginId = context.FindMarginIdForDate(rateDateTime);

        foreach (var rate in rates)
        {
            // Find or create the currency entity
            var toCurrency = context.Currencies.FirstOrDefault(c => c.CurrencyCode == rate.Key);

            if (toCurrency == null)
            {
                toCurrency = new Currency { CurrencyCode = rate.Key };
                context.Currencies.Add(toCurrency);
                await context.SaveChangesAsync();
            }

            // Check if the rate already exists for this date and currency
            bool exists = context.CurrencyRates.Any(cr =>
                cr.Date == rateDateTime &&
                cr.ToCurrencyId == toCurrency.Id);

            if (exists)
                continue;

            // Add new currency rate
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
