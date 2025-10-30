using System;
using Microsoft.Extensions.Configuration;

namespace CurrencyRateFetcher
{
    public static class SettingsHelper
    {
        public class DatabaseConfig
        {
            public string? dbName { get; set; }
            public string? dbAddress { get; set; }
            public string? dbPort { get; set; }
            public string? dbUser { get; set; }
            public string? dbPassword { get; set; }
        }
        
        public static DatabaseConfig SettingsLoading()
        {

            // System settings from the JSON file
            var systemSettings = new ConfigurationBuilder()
                .SetBasePath(AppContext.BaseDirectory) // Executable directory
                .AddJsonFile("systemSettings.json", optional: false, reloadOnChange: true) // File from the current directory
                .Build();

            var databaseSection = systemSettings.GetSection("SystemPreferences:Database");
            var databaseConfig = new DatabaseConfig
            {
                dbName = databaseSection["Name"],
                dbAddress = databaseSection["Address"],
                dbPort = databaseSection["Port"],
                dbUser = databaseSection["User"],
                dbPassword = databaseSection["Password"]
            };

            var smtpSection = systemSettings.GetSection("SystemPreferences:Smtp");
            

            return databaseConfig;
        }

    }
}
