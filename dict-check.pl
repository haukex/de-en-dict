#!/usr/bin/env perl
use 5.036;  # strict and warnings
use open qw/:std :utf8/;
# Debian/Ubuntu: `sudo apt install libio-socket-ssl-perl`  # depends on libnet-ssleay-perl
use Net::SSLeay 1.49;  # for HTTP::Tiny SSL support
use IO::Socket::SSL 1.42;  # for HTTP::Tiny SSL support
use File::Spec::Functions qw/catfile/;
use IO::Uncompress::Gunzip qw(gunzip $GunzipError);
use JSON::PP qw/decode_json/;
use File::Temp qw/tempfile/;
use Data::Dumper ();
use charnames ();
use HTTP::Tiny;
use FindBin;
$|=1;

=head1 Synopsis

This is a script to check the German-English Dictionary formatting.
(It doesn't do a *full* parse because that would be too difficult.)

Its purpose is to check that the format of the dictionary file is
regular enough such that it can be processed as expected by the
JavaScript code (e.g., each line is "German :: English", sub-entries
are separated by "|", and that angle, square, and curly braces aren't
nested, and so on).

=head2 Author, Copyright, and License

Copyright © 2024-2025 Hauke Dämpfling (haukex@zero-g.net)

This project is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This project is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this project; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

=cut

sub pp { Data::Dumper->new(\@_)->Terse(1)->Purity(1)->Useqq(1)->Quotekeys(0)->Sortkeys(1)->Indent(0)->Pair('=>')->Dump }

my $DICT_FILE = catfile($FindBin::Bin, 'de-en.txt.gz');
my $DICT_URL = 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/de-en.txt.gz';
my $ABBR_FILE = catfile($FindBin::Bin, 'src', 'js', 'abbreviations.json');
my $ABBR_URL = 'https://raw.githubusercontent.com/Tekl/beolingus-deutsch-englisch/master/abbreviations.json';
my $ALPHA_JSON = catfile($FindBin::Bin, 'src', 'workers', 'alphabet.json');

sub mirror ($url, $file) {
    my $resp = HTTP::Tiny->new->mirror($url, $file);
    $$resp{success} or die "$url $$resp{status} $$resp{reason}".($$resp{status}==599 ? ": $$resp{content}" : '');
}

# investigate abbreviations.json
open my $jfh, '<:raw', $ABBR_FILE or die "$ABBR_FILE: $!";
my $abbr = decode_json( do { local $/; <$jfh> } );
close $jfh;
while ( my ($k,$v) = each %$abbr ) {
    $k =~ m{ \A (?:
        \[ (?<CONTENT> [ a-z A-Z . ' \x20
            \N{LATIN SMALL LETTER A WITH DIAERESIS}
            \N{LATIN SMALL LETTER O WITH DIAERESIS}
            \N{LATIN SMALL LETTER U WITH DIAERESIS}
            \N{LATIN CAPITAL LETTER O WITH DIAERESIS}
            ]+ )
        \] | \{ (?&CONTENT) \} | \N{REGISTERED SIGN}
    ) \z }msxxaan or die "bad abbr key ".pp($k);
    my @vk = sort keys %$v;
    die "bad abbr val ".pp($v)
        if @vk != 2 || $vk[0] ne 'de' || $vk[1] ne 'en';
    for my $vv ($$v{de}, $$v{en}) {
        # IMPORTANT: shouldn't contain HTML special characters like < > & ' "
        $vv =~ m{ \A
            [ a-z A-Z , ; : ( ) \- \x20
            \N{LATIN SMALL LETTER A WITH DIAERESIS}
            \N{LATIN SMALL LETTER O WITH DIAERESIS}
            \N{LATIN SMALL LETTER U WITH DIAERESIS}
            \N{LATIN CAPITAL LETTER O WITH DIAERESIS}
            \N{LATIN SMALL LETTER SHARP S}
            ]+
        \z }msxxaan or die "bad abbr val for key ".pp($k).": ".pp($vv);
    }
}

# compare our version to the one at Tekl/beolingus-deutsch-englisch
my ($tfh,$tfn) = tempfile(UNLINK=>1,SUFFIX=>'.json');
close $tfh;
mirror($ABBR_URL, $tfn);
system('diff','-u',$ABBR_FILE,$tfn);

# Note that single quotes (') are not treated specially because of their varied usage (and some typos in the data):
# "can't", "hunters' parlance", "height 5' 7''", "x prime /x'/", "f';" (f-prime), and as quotes.

# Note the grammar does not treat "/Abbrev/" specially, because there are too many variations of that,
# e.g. "three eighth / 3/8 /" and "dipped [Br.] / dimmed [Am.] headlights/lights; dipped [Br.] / low [Am.] beam(s)/beam light"

# REMEMBER to keep all of the special characters here in sync with equiv.ts !
my %ALPHABET = ( re => {
    word => [
        # ##### ##### Letters ##### #####
        'a-z', 'A-Z',
        map( {charnames::string_vianame($_)}
            'LATIN SMALL LETTER A WITH DIAERESIS',
            'LATIN SMALL LETTER E WITH DIAERESIS',
            'LATIN SMALL LETTER I WITH DIAERESIS',
            'LATIN SMALL LETTER O WITH DIAERESIS',
            'LATIN SMALL LETTER U WITH DIAERESIS',
            'LATIN CAPITAL LETTER A WITH DIAERESIS',
            'LATIN CAPITAL LETTER O WITH DIAERESIS',
            'LATIN CAPITAL LETTER U WITH DIAERESIS',
            'LATIN SMALL LETTER SHARP S',
            'LATIN CAPITAL LETTER A WITH ACUTE',
            'LATIN CAPITAL LETTER E WITH ACUTE',
            'LATIN CAPITAL LETTER I WITH CIRCUMFLEX',
            'LATIN SMALL LETTER A WITH ACUTE',
            'LATIN SMALL LETTER E WITH ACUTE',
            'LATIN SMALL LETTER I WITH ACUTE',
            'LATIN SMALL LETTER O WITH ACUTE',
            'LATIN SMALL LETTER A WITH GRAVE',
            'LATIN SMALL LETTER E WITH GRAVE',
            'LATIN SMALL LETTER I WITH GRAVE',
            'LATIN SMALL LETTER O WITH GRAVE',
            'LATIN SMALL LETTER A WITH CIRCUMFLEX',
            'LATIN SMALL LETTER E WITH CIRCUMFLEX',
            'LATIN SMALL LETTER I WITH CIRCUMFLEX',
            'LATIN SMALL LETTER O WITH CIRCUMFLEX',
            'LATIN SMALL LETTER U WITH CIRCUMFLEX',
            'LATIN SMALL LETTER A WITH TILDE',
            'LATIN SMALL LETTER N WITH TILDE',
            'LATIN SMALL LETTER I WITH MACRON',
            'LATIN SMALL LETTER C WITH CEDILLA',
            'LATIN CAPITAL LETTER S WITH CARON',
            'LATIN SMALL LETTER A WITH RING ABOVE',
            'LATIN SMALL LETTER L WITH STROKE',
            'LATIN SMALL LETTER AE',
            'GREEK SMALL LETTER ALPHA',
            'GREEK SMALL LETTER LAMDA',
            'GREEK CAPITAL LETTER OMEGA',
            'LATIN SUBSCRIPT SMALL LETTER X',
        ),
        # ##### ##### Digits ##### #####
        '0-9',
        # Note subscript digits happen to be in sequence in Unicode, but superscripts aren't!
        "\N{SUBSCRIPT ZERO}-\N{SUBSCRIPT NINE}",      # U+2080 - U+2089
        "\N{SUPERSCRIPT ZERO}",                       # U+2070
        "\N{SUPERSCRIPT ONE}",                        # U+00B9
        "\N{SUPERSCRIPT TWO}",                        # U+00B2
        "\N{SUPERSCRIPT THREE}",                      # U+00B3
        "\N{SUPERSCRIPT FOUR}-\N{SUPERSCRIPT NINE}",  # U+2074 - U+2079
    ],
    special => [
        # ##### ##### Special Characters ##### #####
        # Note double colon (::), pipe (|), and semicolon (;) are separators that we explicitly don't want to match here.
        # We also treat quotation marks specially in the grammar, so they're not included here.
        map( {quotemeta} ' ','!','$','%','&','+',',','-','.','/',':','=','?','~',"'",),
        map( {charnames::string_vianame($_)}
            'RIGHT SINGLE QUOTATION MARK',
            'EN DASH',
            'DEGREE SIGN',
            'SECTION SIGN',
            'HORIZONTAL ELLIPSIS',
            'MICRO SIGN',
            'VULGAR FRACTION ONE HALF',
            'MULTIPLICATION SIGN',
            'DOT OPERATOR',
            'EURO SIGN',
            'POUND SIGN',
            'REGISTERED SIGN',
            'SUPERSCRIPT MINUS',
            'MODIFIER LETTER REVERSED COMMA',
        )
    ],
} );
$_ = '['.join('',@$_).']' for values $ALPHABET{re}->%*;
open my $afh, '>:raw:encoding(ASCII)', $ALPHA_JSON or die "$ALPHA_JSON: $!";
print {$afh} JSON::PP->new->ascii->pretty->canonical->encode({
    _comment=>'DO NOT EDIT - this file is generated by dict-check.pl',
    %ALPHABET});
close $afh;

my (%seen_brackets, %seen_braces);
my $LINE_GRAMMAR = qr{
    (?(DEFINE)
        (?<TOKEN>
            # letters and digits
            $ALPHABET{re}{word}

            # ##### ##### Special Sequences ##### #####
            # characters we would otherwise treat specially
            | (?> / [ () [\] <> {} ] / )    # "left square bracket /[/" etc.
            | (?> \( [<>] \) )              # "greater-than sign (>)" etc.
            | (?> [<>] \x20* [0-9] (?!-) )  # greater/less than a number (special case "four column design <4-column>")
            | (?> /:-\)/ )                  # "Smiley"
            # special characters occurring only once
            | (?> / [ \\ \N{ACUTE ACCENT} ] / )
            | (?> \( [ @ \N{CENT SIGN} \N{YEN SIGN} \N{COPYRIGHT SIGN} ] \) )
            | (?> \( \# \x20am\x20Telefon \) )  # "Rautentaste"

            # special characters
            | (?!::) $ALPHABET{re}{special}
        )

        (?<STRING> (
            (?>   \N{LEFT DOUBLE QUOTATION MARK}  ( (?> \( (?&TOKEN)++ \) ) | (?&TOKEN) )++ \N{RIGHT DOUBLE QUOTATION MARK} )  # English style
            | (?> \N{DOUBLE LOW-9 QUOTATION MARK} ( (?> \( (?&TOKEN)++ \) ) | (?&TOKEN) )++ \N{LEFT DOUBLE QUOTATION MARK}  )  # German style
            | (?> " (?&TOKEN)++ " )
            | (?&TOKEN)*+
        )*+ )

        (?<PARENTHESES>            (?> \( (?&STRING) ( ; (?&STRING) )*+ \) ) )
        (?<BRACKETS> (?<_BRACKETS> (?> \[ (?&STRING) ( ; (?&STRING) )*+ \] ) )(?{$seen_brackets{$^N}++}) )

        # NOTE: As a general rule determined by visual inspection of %seen_braces,
        # it seems that all braces with semicolons are English conjugations, except for "{prp; ...}"
        # For example: "{swam; swum}", "to swing {swung (swang [obs.]); swung}"
        (?<BRACES> (?<_BRACES> (?> \{
            (?<IN_BRACE_STR>  (
                (?> \(
                    (?<ONLY_BRACKET_STR> ( (?&BRACKETS) | (?&STRING) )* )
                    ( ; (?&ONLY_BRACKET_STR) )*
                \) )
                | (?&BRACKETS)  # "to clothe {clothed, clad [obs.]; clothed, clad [obs.]}"
                | (?&STRING) )*  )
            ( ; (?&IN_BRACE_STR) )*
        \} ) )(?{$seen_braces{$^N}++}) )

        (?<ANGLES>  (?> \<
            (?<IN_ANGLE_STR> (
                (?&PARENTHESES)  # "<after tax (operating) results>"
                | (?&STRING) )*  )
            ( ; (?&IN_ANGLE_STR) )*+
        \> ) )

        (?<ENTRY>  (?&ANY_BAL_LIST) ( \| (?&ANY_BAL_LIST) )* )
        (?<ANY_BAL_LIST>
            (?<ANY_BAL_STR>  (
                (?> \(
                    (?<IN_PAREN_STR> (
                        (?&PARENTHESES)  # "(formation of erosion hollows in (former) stream beds)"
                        | (?&BRACKETS)   # "Sakko {n} ({m} [Schw.])"
                        | (?&BRACES)     # "Sakko {n} ({m} [Schw.])"
                        | (?&ANGLES)     # "to put through (<> a deal)"
                        | (?&STRING) )*  )
                    ( ; (?&IN_PAREN_STR) )*
                \) )
                | (?&BRACKETS)
                | (?&BRACES)
                | (?&ANGLES)
                | (?&STRING) )*  )
            ( ; (?&ANY_BAL_STR) )*  )
    )
    \A (?<LEFT> (?&ENTRY) ) :: (?<RIGHT> (?&ENTRY) ) \z
}msxxaan;

mirror($DICT_URL, $DICT_FILE);
gunzip $DICT_FILE => \my $buffer or die "gunzip failed: $GunzipError\n";
open my $fh, '<:raw:encoding(UTF-8)', \$buffer or die $!;
my $fail_cnt = 0;
while (my $line = <$fh>) {
    chomp($line);  # remove trailing newline
    next if $line=~/^\s*#/ || $line!~/\S/;  # skip comments and blank lines
    $line =~ s/\Q{f} [auch {pl}]/{f, auch pl}/;  # special case: adjust b/c brackets don't normally contain braces
    $line =~ s/hydro\K\xAD(?=magnetics)/-/;      # special case: fix a soft hyphen
    if ( $line =~ $LINE_GRAMMAR ) {  # parse the line
        my ($de, $en) = ($+{LEFT}, $+{RIGHT});
        my @des = split m/\|/, $de;
        my @ens = split m/\|/, $en;
        @des == @ens or die "Did not get the same number of sub-entries in ".pp($line)."\n";
        #say pp \@des, \@ens;  # debugging, helps visualize runaway regex
    }
    else {
        warn "Failed to parse ".pp($line)."\n";
        die "Aborting after too many failures\n" if ++$fail_cnt>=100;
    }
}
close $fh;

say "Report: The following annotations are not contained in the abbreviations list:";
# see the notes on braces in the grammar above: the following filter removes most conjugations
say join ', ', grep {!$$abbr{$_}} sort keys %seen_brackets, grep {/^{prp;/||!/;/} keys %seen_braces;
#TODO Later: Items from this annotation report could be added to abbreviations.json.

die "$fail_cnt failures\n" if $fail_cnt;
say "No failures";
