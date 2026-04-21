-- Fix rating columns: DECIMAL(5,2) overflows at 1200 — widen to DECIMAL(7,2) (max 99999.99)
ALTER TABLE public.profiles
    ALTER COLUMN rating_bullet    TYPE DECIMAL(7,2),
    ALTER COLUMN rating_blitz     TYPE DECIMAL(7,2),
    ALTER COLUMN rating_rapid     TYPE DECIMAL(7,2),
    ALTER COLUMN rating_classical TYPE DECIMAL(7,2),
    ALTER COLUMN accuracy_rating           TYPE DECIMAL(5,2),
    ALTER COLUMN accuracy_rating_blitz     TYPE DECIMAL(5,2),
    ALTER COLUMN accuracy_rating_rapid     TYPE DECIMAL(5,2),
    ALTER COLUMN accuracy_rating_bullet    TYPE DECIMAL(5,2),
    ALTER COLUMN peak_accuracy_rating      TYPE DECIMAL(5,2);

ALTER TABLE public.games
    ALTER COLUMN white_accuracy TYPE DECIMAL(5,2),
    ALTER COLUMN black_accuracy TYPE DECIMAL(5,2);
