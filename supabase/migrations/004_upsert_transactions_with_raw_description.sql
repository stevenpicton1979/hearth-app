-- Create a stored function to handle transaction upserts with raw_description backfill
create or replace function upsert_transactions(
  p_rows jsonb
)
returns table(inserted integer, duplicates integer) as $$
declare
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_row jsonb;
begin
  -- Process each row from the input array
  for v_row in select jsonb_array_elements(p_rows)
  loop
    insert into transactions (
      household_id,
      account_id,
      date,
      amount,
      description,
      merchant,
      category,
      classification,
      is_transfer,
      basiq_transaction_id,
      raw_description,
      source
    )
    values (
      (v_row->>'household_id')::uuid,
      (v_row->>'account_id')::uuid,
      (v_row->>'date')::date,
      (v_row->>'amount')::numeric,
      v_row->>'description',
      v_row->>'merchant',
      v_row->>'category',
      v_row->>'classification',
      coalesce((v_row->>'is_transfer')::boolean, false),
      v_row->>'basiq_transaction_id',
      v_row->>'raw_description',
      v_row->>'source'
    )
    on conflict (account_id, date, amount, description) do update
    set
      -- Only update raw_description if the existing one is null
      -- Leave all other fields untouched
      raw_description = case
        when transactions.raw_description is null then excluded.raw_description
        else transactions.raw_description
      end
    where transactions.raw_description is null
    returning 1;

    if found then
      v_inserted := v_inserted + 1;
    else
      v_duplicates := v_duplicates + 1;
    end if;
  end loop;

  return query select v_inserted, v_duplicates;
end;
$$ language plpgsql;
