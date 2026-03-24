ALTER TABLE team ADD COLUMN faab_spent NUMERIC DEFAULT 0;
COMMENT ON COLUMN team.faab_spent IS 'FAAB dollars spent this season, extracted from ESPN transactionCounter.acquisitionBudgetSpent';
